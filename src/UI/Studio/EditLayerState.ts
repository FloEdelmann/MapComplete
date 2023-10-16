import { OsmConnection } from "../../Logic/Osm/OsmConnection"
import { ConfigMeta } from "./configMeta"
import { Store, UIEventSource } from "../../Logic/UIEventSource"
import { LayerConfigJson } from "../../Models/ThemeConfig/Json/LayerConfigJson"
import { QueryParameters } from "../../Logic/Web/QueryParameters"
import {
    ConversionContext,
    ConversionMessage,
    DesugaringContext,
    Pipe,
} from "../../Models/ThemeConfig/Conversion/Conversion"
import { PrepareLayer } from "../../Models/ThemeConfig/Conversion/PrepareLayer"
import { ValidateLayer } from "../../Models/ThemeConfig/Conversion/Validation"
import { AllSharedLayers } from "../../Customizations/AllSharedLayers"
import { QuestionableTagRenderingConfigJson } from "../../Models/ThemeConfig/Json/QuestionableTagRenderingConfigJson"
import { TagUtils } from "../../Logic/Tags/TagUtils"
import StudioServer from "./StudioServer"
import { Utils } from "../../Utils"

/**
 * Sends changes back to the server
 */
export class LayerStateSender {
    constructor(layerState: EditLayerState) {
        layerState.configuration.addCallback(async (config) => {
            const id = config.id
            if (id === undefined) {
                console.warn("No id found in layer, not updating")
                return
            }
            await layerState.server.updateLayer(<LayerConfigJson>config)
        })
    }
}

export default class EditLayerState {
    public readonly osmConnection: OsmConnection
    public readonly schema: ConfigMeta[]

    public readonly featureSwitches: { featureSwitchIsDebugging: UIEventSource<boolean> }

    public readonly configuration: UIEventSource<Partial<LayerConfigJson>> = new UIEventSource<
        Partial<LayerConfigJson>
    >({})
    public readonly messages: Store<ConversionMessage[]>
    public readonly server: StudioServer

    constructor(schema: ConfigMeta[], server: StudioServer) {
        this.schema = schema
        this.server = server
        this.osmConnection = new OsmConnection({
            oauth_token: QueryParameters.GetQueryParameter(
                "oauth_token",
                undefined,
                "Used to complete the login"
            ),
        })
        this.featureSwitches = {
            featureSwitchIsDebugging: new UIEventSource<boolean>(true),
        }
        let state: DesugaringContext
        {
            const layers = AllSharedLayers.getSharedLayersConfigs()
            const questions = layers.get("questions")
            const sharedQuestions = new Map<string, QuestionableTagRenderingConfigJson>()
            for (const question of questions.tagRenderings) {
                sharedQuestions.set(question["id"], <QuestionableTagRenderingConfigJson>question)
            }
            state = {
                tagRenderings: sharedQuestions,
                sharedLayers: layers,
            }
        }
        this.messages = this.configuration.mapD((config) => {
            const context = ConversionContext.construct([], ["prepare"])
            const trs = Utils.NoNull(config.tagRenderings ?? [])
            for (let i = 0; i < trs.length; i++) {
                const tr = trs[i]
                if (typeof tr === "string") {
                    continue
                }
                if (!tr["id"] && !tr["override"]) {
                    const qtr = <QuestionableTagRenderingConfigJson>tr
                    let id = "" + i
                    if (qtr?.freeform?.key) {
                        id = qtr?.freeform?.key
                    } else if (qtr.mappings?.[0]?.if) {
                        id =
                            qtr.freeform?.key ??
                            TagUtils.Tag(qtr.mappings[0].if).usedKeys()?.[0] ??
                            "" + i
                    }
                    qtr["id"] = id
                }
            }

            const prepare = new Pipe(
                new PrepareLayer(state),
                new ValidateLayer("dynamic", false, undefined)
            )
            prepare.convert(<LayerConfigJson>config, context)
            return context.messages
        })
    }

    public getCurrentValueFor(path: ReadonlyArray<string | number>): any | undefined {
        // Walk the path down to see if we find something
        let entry = this.configuration.data
        for (let i = 0; i < path.length; i++) {
            if (entry === undefined) {
                // We reached a dead end - no old vlaue
                return undefined
            }
            const breadcrumb = path[i]
            entry = entry[breadcrumb]
        }
        return entry
    }

    private readonly _stores = new Map<string, UIEventSource<any>>()
    public getStoreFor<T>(path: ReadonlyArray<string | number>): UIEventSource<T | undefined> {
        const key = path.join(".")

        // TODO check if this gives problems when changing the order of e.g. mappings and questions
        if (this._stores.has(key)) {
            return this._stores.get(key)
        }
        const store = new UIEventSource<any>(this.getCurrentValueFor(path))
        store.addCallback((v) => {
            this.setValueAt(path, v)
        })
        this._stores.set(key, store)
        return store
    }

    public register(
        path: ReadonlyArray<string | number>,
        value: Store<any>,
        noInitialSync: boolean = false
    ): () => void {
        const unsync = value.addCallback((v) => this.setValueAt(path, v))
        if (!noInitialSync) {
            this.setValueAt(path, value.data)
        }
        return unsync
    }

    public getSchemaStartingWith(path: string[]) {
        return this.schema.filter(
            (sch) =>
                !path.some((part, i) => !(sch.path.length > path.length && sch.path[i] === part))
        )
    }

    public getTranslationAt(path: string[]): ConfigMeta {
        const origConfig = this.getSchema(path)[0]
        return {
            path,
            type: "translation",
            hints: {
                typehint: "translation",
            },
            required: origConfig.required ?? false,
            description: origConfig.description ?? "A translatable object",
        }
    }

    public getSchema(path: string[]): ConfigMeta[] {
        const schemas = this.schema.filter(
            (sch) =>
                sch !== undefined &&
                !path.some((part, i) => !(sch.path.length == path.length && sch.path[i] === part))
        )
        if (schemas.length == 0) {
            console.warn("No schemas found for path", path.join("."))
        }
        return schemas
    }

    public setValueAt(path: ReadonlyArray<string | number>, v: any) {
        let entry = this.configuration.data
        const isUndefined =
            v !== undefined &&
            v !== null &&
            v !== "" &&
            !(typeof v === "object" && Object.keys({}).length === 0)

        for (let i = 0; i < path.length - 1; i++) {
            const breadcrumb = path[i]
            if (entry[breadcrumb] === undefined) {
                entry[breadcrumb] = typeof path[i + 1] === "number" ? [] : {}
            }
            entry = entry[breadcrumb]
            if (entry === undefined && isUndefined) {
                // Nothing to do anymore: we cannot traverse the object, but don't have to set something anyway
                return
            }
        }
        if (isUndefined) {
            entry[path.at(-1)] = v
        } else if (entry) {
            delete entry[path.at(-1)]
        }
        this.configuration.ping()
    }
}
