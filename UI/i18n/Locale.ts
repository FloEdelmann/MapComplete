import {UIEventSource} from "../../Logic/UIEventSource"
import {LocalStorageSource} from "../../Logic/Web/LocalStorageSource"
import {Utils} from "../../Utils"
import {QueryParameters} from "../../Logic/Web/QueryParameters"

export default class Locale {
    public static showLinkToWeblate: UIEventSource<boolean> = new UIEventSource<boolean>(false)
    /**
     * Indicates that -if showLinkToWeblate is true- a link on mobile mode is shown as well
     */
    public static showLinkOnMobile: UIEventSource<boolean> = new UIEventSource<boolean>(false)
    public static language: UIEventSource<string> = Locale.setup()

    /**
     * Creates the UIEventSource containing the identifier of the current language
     *
     * If the QueryParameter 'language' is set, this query parameter will be used as backing source value
     * If not set, a localStorageSource will be used. This will use the navigator language by default
     *
     * Note that other parts of the code (most notably the UserRelatedState) might sync language selection with OSM.
     *
     *
     * @private
     */
    private static setup() {

        let source: UIEventSource<string>

        if (QueryParameters.wasInitialized("language") || Utils.runningFromConsole) {
            console.log("Language was initialized via URL-parameter - using the URL parameter as store instead of local storage", QueryParameters.wasInitialized("language"))
            source = QueryParameters.GetQueryParameter(
                "language",
                undefined,
                ["The language to display MapComplete in.",
                    "The user display language is determined in the following order:",
                    "- If the user did log in and did set their language before with MapComplete, use this language",
                    "- If the user visited MapComplete before and did change their language, use the language as set by this URL-parameter. This will _disable_ saving the language to localStorage in case a non-logged-in user changes their language",
                    "- Use the navigator-language (if available)",
                    "- Use English",
                    "",
                    "Note that this URL-parameter is not added to the URL-bar by default.",
                    "",
                    "Translations are never complete. If a translation in a certain language is missing, English is used as fallback."].join("\n"),
            )
        } else {
            let browserLanguage = "en"
            if (typeof navigator !== "undefined") {
                browserLanguage = navigator.languages?.[0] ?? navigator.language ?? "en"
                console.log("Browser language is", browserLanguage)
            }
            source = LocalStorageSource.Get("language", browserLanguage)
        }

        if (!Utils.runningFromConsole) {
            // @ts-ignore
            window.setLanguage = function (language: string) {
                source.setData(language)
            }
        }

        QueryParameters.GetBooleanQueryParameter(
            "fs-translation-mode",
            false,
            "If set, will show a translation button next to every string."
        ).addCallbackAndRunD((tr) => {
            Locale.showLinkToWeblate.setData(Locale.showLinkToWeblate.data || tr)
        })

        return source
    }
}
