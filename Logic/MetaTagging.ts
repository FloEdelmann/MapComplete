import SimpleMetaTaggers, { MetataggingState, SimpleMetaTagger } from "./SimpleMetaTagger"
import { ExtraFuncParams, ExtraFunctions } from "./ExtraFunctions"
import LayerConfig from "../Models/ThemeConfig/LayerConfig"
import { Feature } from "geojson"
import FeaturePropertiesStore from "./FeatureSource/Actors/FeaturePropertiesStore"
import LayoutConfig from "../Models/ThemeConfig/LayoutConfig"
import { GeoIndexedStoreForLayer } from "./FeatureSource/Actors/GeoIndexedStore"
import { IndexedFeatureSource } from "./FeatureSource/FeatureSource"
import OsmObjectDownloader from "./Osm/OsmObjectDownloader"

/**
 * Metatagging adds various tags to the elements, e.g. lat, lon, surface area, ...
 *
 * All metatags start with an underscore
 */
export default class MetaTagging {
    private static errorPrintCount = 0
    private static readonly stopErrorOutputAt = 10
    private static retaggingFuncCache = new Map<string, ((feature: Feature) => void)[]>()

    constructor(state: {
        layout: LayoutConfig
        osmObjectDownloader: OsmObjectDownloader
        perLayer: ReadonlyMap<string, GeoIndexedStoreForLayer>
        indexedFeatures: IndexedFeatureSource
        featureProperties: FeaturePropertiesStore
    }) {
        const params: ExtraFuncParams = {
            getFeatureById: (id) => state.indexedFeatures.featuresById.data.get(id),
            getFeaturesWithin: (layerId, bbox) =>
                state.perLayer.get(layerId).GetFeaturesWithin(bbox),
        }
        for (const layer of state.layout.layers) {
            if (layer.source === null) {
                continue
            }
            const featureSource = state.perLayer.get(layer.id)
            featureSource.features?.stabilized(1000)?.addCallbackAndRunD((features) => {
                if (!(features?.length > 0)) {
                    // No features to handle
                    return
                }
                console.trace(
                    "Recalculating metatags for layer ",
                    layer.id,
                    "due to a change in the upstream features. Contains ",
                    features.length,
                    "items"
                )
                MetaTagging.addMetatags(
                    features,
                    params,
                    layer,
                    state.layout,
                    state.osmObjectDownloader,
                    state.featureProperties
                )
            })
        }
    }

    /**
     * This method (re)calculates all metatags and calculated tags on every given object.
     * The given features should be part of the given layer
     *
     * Returns true if at least one feature has changed properties
     */
    public static addMetatags(
        features: Feature[],
        params: ExtraFuncParams,
        layer: LayerConfig,
        layout: LayoutConfig,
        osmObjectDownloader: OsmObjectDownloader,
        featurePropertiesStores?: FeaturePropertiesStore,
        options?: {
            includeDates?: true | boolean
            includeNonDates?: true | boolean
            evaluateStrict?: false | boolean
        }
    ): boolean {
        if (features === undefined || features.length === 0) {
            return
        }

        const metatagsToApply: SimpleMetaTagger[] = []
        for (const metatag of SimpleMetaTaggers.metatags) {
            if (metatag.includesDates) {
                if (options?.includeDates ?? true) {
                    metatagsToApply.push(metatag)
                }
            } else {
                if (options?.includeNonDates ?? true) {
                    metatagsToApply.push(metatag)
                }
            }
        }

        // The calculated functions - per layer - which add the new keys
        const layerFuncs = this.createRetaggingFunc(layer)
        const state: MetataggingState = { layout, osmObjectDownloader }

        let atLeastOneFeatureChanged = false

        for (let i = 0; i < features.length; i++) {
            const feature = features[i]
            const tags = featurePropertiesStores?.getStore(feature.properties.id)
            let somethingChanged = false
            let definedTags = new Set(Object.getOwnPropertyNames(feature.properties))
            for (const metatag of metatagsToApply) {
                try {
                    if (!metatag.keys.some((key) => !(key in feature.properties))) {
                        // All keys are already defined, we probably already ran this one
                        // Note that we use 'key in properties', not 'properties[key] === undefined'. The latter will cause evaluation of lazy properties
                        continue
                    }

                    if (metatag.isLazy) {
                        if (!metatag.keys.some((key) => !definedTags.has(key))) {
                            // All keys are defined - lets skip!
                            continue
                        }
                        somethingChanged = true
                        metatag.applyMetaTagsOnFeature(feature, layer, tags, state)
                        if (options?.evaluateStrict) {
                            for (const key of metatag.keys) {
                                feature.properties[key]
                            }
                        }
                    } else {
                        const newValueAdded = metatag.applyMetaTagsOnFeature(
                            feature,
                            layer,
                            tags,
                            state
                        )
                        /* Note that the expression:
                         * `somethingChanged = newValueAdded || metatag.applyMetaTagsOnFeature(feature, freshness)`
                         * Is WRONG
                         *
                         * IF something changed is `true` due to an earlier run, it will short-circuit and _not_ evaluate the right hand of the OR,
                         * thus not running an update!
                         */
                        somethingChanged = newValueAdded || somethingChanged
                    }
                } catch (e) {
                    console.error(
                        "Could not calculate metatag for ",
                        metatag.keys.join(","),
                        ":",
                        e,
                        e.stack
                    )
                }
            }

            if (layerFuncs !== undefined) {
                let retaggingChanged = false
                try {
                    retaggingChanged = layerFuncs(params, feature)
                } catch (e) {
                    console.error(e)
                }
                somethingChanged = somethingChanged || retaggingChanged
            }

            if (somethingChanged) {
                try {
                    featurePropertiesStores?.getStore(feature.properties.id)?.ping()
                } catch (e) {
                    console.error("Could not ping a store for a changed property due to", e)
                }
                atLeastOneFeatureChanged = true
            }
        }
        return atLeastOneFeatureChanged
    }

    private static createFunctionsForFeature(
        layerId: string,
        calculatedTags: [string, string, boolean][]
    ): ((feature: any) => void)[] {
        const functions: ((feature: any) => any)[] = []
        for (const entry of calculatedTags) {
            const key = entry[0]
            const code = entry[1]
            const isStrict = entry[2]
            if (code === undefined) {
                continue
            }

            const calculateAndAssign: (feat: any) => any = (feat) => {
                try {
                    let result = new Function("feat", "return " + code + ";")(feat)
                    if (result === "") {
                        result === undefined
                    }
                    if (result !== undefined && typeof result !== "string") {
                        // Make sure it is a string!
                        result = JSON.stringify(result)
                    }
                    delete feat.properties[key]
                    feat.properties[key] = result
                    return result
                } catch (e) {
                    if (MetaTagging.errorPrintCount < MetaTagging.stopErrorOutputAt) {
                        console.warn(
                            "Could not calculate a " +
                                (isStrict ? "strict " : "") +
                                " calculated tag for key " +
                                key +
                                " defined by " +
                                code +
                                " (in layer" +
                                layerId +
                                ") due to \n" +
                                e +
                                "\n. Are you the theme creator? Doublecheck your code. Note that the metatags might not be stable on new features",
                            e,
                            e.stack
                        )
                        MetaTagging.errorPrintCount++
                        if (MetaTagging.errorPrintCount == MetaTagging.stopErrorOutputAt) {
                            console.error(
                                "Got ",
                                MetaTagging.stopErrorOutputAt,
                                " errors calculating this metatagging - stopping output now"
                            )
                        }
                    }
                    return undefined
                }
            }

            if (isStrict) {
                functions.push(calculateAndAssign)
                continue
            }

            // Lazy function
            const f = (feature: any) => {
                delete feature.properties[key]
                Object.defineProperty(feature.properties, key, {
                    configurable: true,
                    enumerable: false, // By setting this as not enumerable, the localTileSaver will _not_ calculate this
                    get: function () {
                        return calculateAndAssign(feature)
                    },
                })
                return undefined
            }

            functions.push(f)
        }
        return functions
    }

    /**
     * Creates the function which adds all the calculated tags to a feature. Called once per layer
     */
    private static createRetaggingFunc(
        layer: LayerConfig
    ): (params: ExtraFuncParams, feature: any) => boolean {
        const calculatedTags: [string, string, boolean][] = layer.calculatedTags
        if (calculatedTags === undefined || calculatedTags.length === 0) {
            return undefined
        }

        let functions: ((feature: Feature) => void)[] = MetaTagging.retaggingFuncCache.get(layer.id)
        if (functions === undefined) {
            functions = MetaTagging.createFunctionsForFeature(layer.id, calculatedTags)
            MetaTagging.retaggingFuncCache.set(layer.id, functions)
        }

        return (params: ExtraFuncParams, feature) => {
            const tags = feature.properties
            if (tags === undefined) {
                return
            }

            try {
                ExtraFunctions.FullPatchFeature(params, feature)
                for (const f of functions) {
                    f(feature)
                }
            } catch (e) {
                console.error("Invalid syntax in calculated tags or some other error: ", e)
            }
            return true // Something changed
        }
    }
}
