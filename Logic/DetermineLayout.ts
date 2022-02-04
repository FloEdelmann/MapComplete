import LayoutConfig from "../Models/ThemeConfig/LayoutConfig";
import {QueryParameters} from "./Web/QueryParameters";
import {AllKnownLayouts} from "../Customizations/AllKnownLayouts";
import {FixedUiElement} from "../UI/Base/FixedUiElement";
import {Utils} from "../Utils";
import Combine from "../UI/Base/Combine";
import {SubtleButton} from "../UI/Base/SubtleButton";
import BaseUIElement from "../UI/BaseUIElement";
import {UIEventSource} from "./UIEventSource";
import {LocalStorageSource} from "./Web/LocalStorageSource";
import LZString from "lz-string";
import * as personal from "../assets/themes/personal/personal.json";
import {FixImages, FixLegacyTheme} from "../Models/ThemeConfig/Conversion/LegacyJsonConvert";
import {LayerConfigJson} from "../Models/ThemeConfig/Json/LayerConfigJson";
import SharedTagRenderings from "../Customizations/SharedTagRenderings";
import * as known_layers from "../assets/generated/known_layers.json"
import {LayoutConfigJson} from "../Models/ThemeConfig/Json/LayoutConfigJson";
import {PrepareTheme} from "../Models/ThemeConfig/Conversion/PrepareTheme";
import * as licenses from "../assets/generated/license_info.json"
export default class DetermineLayout {

    private static readonly _knownImages =new Set( Array.from(licenses).map(l => l.path))
    
    /**
     * Gets the correct layout for this website
     */
    public static async GetLayout(): Promise<LayoutConfig> {

        const loadCustomThemeParam = QueryParameters.GetQueryParameter("userlayout", "false", "If not 'false', a custom (non-official) theme is loaded. This custom layout can be done in multiple ways: \n\n- The hash of the URL contains a base64-encoded .json-file containing the theme definition\n- The hash of the URL contains a lz-compressed .json-file, as generated by the custom theme generator\n- The parameter itself is an URL, in which case that URL will be downloaded. It should point to a .json of a theme")
        const layoutFromBase64 = decodeURIComponent(loadCustomThemeParam.data);

        if (layoutFromBase64.startsWith("http")) {
            return await DetermineLayout.LoadRemoteTheme(layoutFromBase64)
        }

        if (layoutFromBase64 !== "false") {
            // We have to load something from the hash (or from disk)
            return DetermineLayout.LoadLayoutFromHash(loadCustomThemeParam)
        }

        let layoutId: string = undefined
        if (location.href.indexOf("buurtnatuur.be") >= 0) {
            layoutId = "buurtnatuur"
        }


        const path = window.location.pathname.split("/").slice(-1)[0];
        if (path !== "theme.html" && path !== "") {
            layoutId = path;
            if (path.endsWith(".html")) {
                layoutId = path.substr(0, path.length - 5);
            }
            console.log("Using layout", layoutId);
        }
        layoutId = QueryParameters.GetQueryParameter("layout", layoutId, "The layout to load into MapComplete").data;
        const layoutToUse: LayoutConfig = AllKnownLayouts.allKnownLayouts.get(layoutId?.toLowerCase());

        if (layoutToUse?.id === personal.id) {
            layoutToUse.layers = AllKnownLayouts.AllPublicLayers()
            for (const layer of layoutToUse.layers) {
                layer.minzoomVisible = Math.max(layer.minzoomVisible, layer.minzoom)
                layer.minzoom = Math.max(16, layer.minzoom)
            }
        }

        return layoutToUse
    }

    public static LoadLayoutFromHash(
        userLayoutParam: UIEventSource<string>
    ): LayoutConfig | null {
        let hash = location.hash.substr(1);
        try {
            // layoutFromBase64 contains the name of the theme. This is partly to do tracking with goat counter
            const dedicatedHashFromLocalStorage = LocalStorageSource.Get(
                "user-layout-" + userLayoutParam.data?.replace(" ", "_")
            );
            if (dedicatedHashFromLocalStorage.data?.length < 10) {
                dedicatedHashFromLocalStorage.setData(undefined);
            }

            const hashFromLocalStorage = LocalStorageSource.Get(
                "last-loaded-user-layout"
            );
            if (hash.length < 10) {
                hash =
                    dedicatedHashFromLocalStorage.data ??
                    hashFromLocalStorage.data;
            } else {
                console.log("Saving hash to local storage");
                hashFromLocalStorage.setData(hash);
                dedicatedHashFromLocalStorage.setData(hash);
            }

            let json: any;
            try {
                json = JSON.parse(atob(hash));
            } catch (e) {
                // We try to decode with lz-string
                try {
                    json = JSON.parse(Utils.UnMinify(LZString.decompressFromBase64(hash)))
                } catch (e) {
                    console.error(e)
                    DetermineLayout.ShowErrorOnCustomTheme("Could not decode the hash", new FixedUiElement("Not a valid (LZ-compressed) JSON"))
                    return null;
                }
            }

            const layoutToUse = DetermineLayout.prepCustomTheme(json)
            userLayoutParam.setData(layoutToUse.id);
            return new LayoutConfig(layoutToUse, false);
        } catch (e) {
            console.error(e)
            if (hash === undefined || hash.length < 10) {
                DetermineLayout.ShowErrorOnCustomTheme("Could not load a theme from the hash", new FixedUiElement("Hash does not contain data"))
            }
            this.ShowErrorOnCustomTheme("Could not parse the hash", new FixedUiElement(e))
            return null;
        }
    }

    public static ShowErrorOnCustomTheme(
        intro: string = "Error: could not parse the custom layout:",
        error: BaseUIElement) {
        new Combine([
            intro,
            error.SetClass("alert"),
            new SubtleButton("./assets/svg/mapcomplete_logo.svg",
                "Go back to the theme overview",
                {url: window.location.protocol + "//" + window.location.hostname + "/index.html", newTab: false})

        ])
            .SetClass("flex flex-col clickable")
            .AttachTo("centermessage");
    }

    private static prepCustomTheme(json: any): LayoutConfigJson {
        const knownLayersDict = new Map<string, LayerConfigJson>()
        for (const key in known_layers.layers) {
            const layer = known_layers.layers[key]
            knownLayersDict.set(layer.id,<LayerConfigJson> layer)
        }
        const converState = {
            tagRenderings: SharedTagRenderings.SharedTagRenderingJson,
            sharedLayers: knownLayersDict
        }
        json = new FixLegacyTheme().convertStrict(json, "While loading a dynamic theme")
        json = new FixImages(DetermineLayout._knownImages).convertStrict(json, "While fixing the images")
        json = new PrepareTheme(converState).convertStrict(json, "While preparing a dynamic theme")
        console.log("The layoutconfig is ", json)
        return json
    }

    private static async LoadRemoteTheme(link: string): Promise<LayoutConfig | null> {
        console.log("Downloading map theme from ", link);

        new FixedUiElement(`Downloading the theme from the <a href="${link}">link</a>...`)
            .AttachTo("centermessage");

        try {

            let parsed = await Utils.downloadJson(link)
            try {
                parsed.id = link;
                console.log("Loaded remote link:", link)
                const layoutToUse = DetermineLayout.prepCustomTheme(parsed)
                return new LayoutConfig(layoutToUse, false)
            } catch (e) {
                console.error(e)
                DetermineLayout.ShowErrorOnCustomTheme(
                    `<a href="${link}">${link}</a> is invalid:`,
                    new FixedUiElement(e)
                )
                return null;
            }

        } catch (e) {
            console.error(e)
            DetermineLayout.ShowErrorOnCustomTheme(
                `<a href="${link}">${link}</a> is invalid - probably not found or invalid JSON:`,
                new FixedUiElement(e)
            )
            return null;
        }
    }

}