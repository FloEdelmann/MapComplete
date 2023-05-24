import { FixedUiElement } from "./UI/Base/FixedUiElement"
import Combine from "./UI/Base/Combine"
import MinimapImplementation from "./UI/Base/MinimapImplementation"
import { Utils } from "./Utils"
import AllThemesGui from "./UI/AllThemesGui"
import DetermineLayout from "./Logic/DetermineLayout"
import LayoutConfig from "./Models/ThemeConfig/LayoutConfig"
import DefaultGUI from "./UI/DefaultGUI"
import State from "./State"
import ShowOverlayLayerImplementation from "./UI/ShowDataLayer/ShowOverlayLayerImplementation"
import { DefaultGuiState } from "./UI/DefaultGuiState"
import { QueryParameters } from "./Logic/Web/QueryParameters"
import DashboardGui from "./UI/DashboardGui"

// Workaround for a stupid crash: inject some functions which would give stupid circular dependencies or crash the other nodejs scripts running from console
MinimapImplementation.initialize()
ShowOverlayLayerImplementation.Implement()
// Miscelleanous
Utils.DisableLongPresses()

class Init {
    public static Init(layoutToUse: LayoutConfig) {
        if (layoutToUse === null) {
            // Something went wrong, error message is already on screen
            return
        }

        if (layoutToUse === undefined) {
            // No layout found
            new AllThemesGui().setup()
            return
        }

        const guiState = new DefaultGuiState()
        State.state = new State(layoutToUse)
        DefaultGuiState.state = guiState
        // This 'leaks' the global state via the window object, useful for debugging
        // @ts-ignore
        window.mapcomplete_state = State.state

        const mode = QueryParameters.GetQueryParameter(
            "mode",
            "map",
            "The mode the application starts in, e.g. 'map', 'dashboard' or 'statistics'"
        )
        if (mode.data === "dashboard") {
            new DashboardGui(State.state, guiState).setup()
        } else {
            new DefaultGUI(State.state, guiState).setup()
        }
    }
}

document.getElementById("decoration-desktop").remove()
new Combine([
    "Initializing... <br/>",
    new FixedUiElement(
        "<a>If this message persist, something went wrong - click here to try again</a>"
    )
        .SetClass("link-underline small")
        .onClick(() => {
            localStorage.clear()
            window.location.reload()
        }),
]).AttachTo("centermessage") // Add an initialization and reset button if something goes wrong

// @ts-ignore
DetermineLayout.GetLayout()
    .then((value) => {
        console.log("Got ", value)
        Init.Init(value)
    })
    .catch((err) => {
        console.error("Error while initializing: ", err, err.stack)
    })
