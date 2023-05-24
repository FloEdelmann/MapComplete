import { UIEventSource } from "../../Logic/UIEventSource"
import Combine from "../Base/Combine"
import Translations from "../i18n/Translations"
import { VariableUiElement } from "../Base/VariableUIElement"
import FilteredLayer from "../../Models/FilteredLayer"
import { TagUtils } from "../../Logic/Tags/TagUtils"
import Svg from "../../Svg"

/**
 * The icon with the 'plus'-sign and the preset icons spinning
 *
 */
export default class AddNewMarker extends Combine {
    constructor(filteredLayers: UIEventSource<FilteredLayer[]>) {
        const icons = new VariableUiElement(
            filteredLayers.map((filteredLayers) => {
                const icons = []
                let last = undefined
                for (const filteredLayer of filteredLayers) {
                    const layer = filteredLayer.layerDef
                    if (layer.name === undefined && !filteredLayer.isDisplayed.data) {
                        continue
                    }
                    for (const preset of filteredLayer.layerDef.presets) {
                        const tags = TagUtils.KVtoProperties(preset.tags)
                        const icon = layer.mapRendering[0]
                            .GenerateLeafletStyle(new UIEventSource<any>(tags), false, {
                                noSize: true,
                            })
                            .html.SetClass("block relative")
                            .SetStyle("width: 42px; height: 42px;")
                        icons.push(icon)
                        if (last === undefined) {
                            last = layer.mapRendering[0]
                                .GenerateLeafletStyle(new UIEventSource<any>(tags), false, {
                                    noSize: true,
                                })
                                .html.SetClass("block relative")
                                .SetStyle("width: 42px; height: 42px;")
                        }
                    }
                }
                if (icons.length === 0) {
                    return undefined
                }
                if (icons.length === 1) {
                    return icons[0]
                }
                icons.push(last)
                const elem = new Combine(icons).SetClass("flex")
                elem.SetClass("slide min-w-min").SetStyle(
                    "animation: slide " + icons.length + "s linear infinite;"
                )
                return elem
            })
        )
        const label = Translations.t.general.add.addNewMapLabel
            .Clone()
            .SetClass(
                "block center absolute text-sm min-w-min pl-1 pr-1 bg-gray-400 rounded-3xl text-white opacity-65 whitespace-nowrap"
            )
            .SetStyle("top: 65px; transform: translateX(-50%)")
        super([
            new Combine([
                Svg.add_pin_svg()
                    .SetClass("absolute")
                    .SetStyle("width: 50px; filter: drop-shadow(grey 0 0 10px"),
                new Combine([icons])
                    .SetStyle("width: 50px")
                    .SetClass("absolute p-1 rounded-full overflow-hidden"),
                Svg.addSmall_svg()
                    .SetClass("absolute animate-pulse")
                    .SetStyle("width: 30px; left: 30px; top: 35px;"),
            ]).SetClass("absolute"),
            new Combine([label]).SetStyle("position: absolute; left: 50%"),
        ])
        this.SetClass("block relative")
    }
}
