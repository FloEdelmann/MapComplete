import { LayoutConfigJson } from "../../../../Models/ThemeConfig/Json/LayoutConfigJson"
import { LayerConfigJson } from "../../../../Models/ThemeConfig/Json/LayerConfigJson"
import { PrepareTheme } from "../../../../Models/ThemeConfig/Conversion/PrepareTheme"
import { TagRenderingConfigJson } from "../../../../Models/ThemeConfig/Json/TagRenderingConfigJson"
import LayoutConfig from "../../../../Models/ThemeConfig/LayoutConfig"
import * as bookcaseLayer from "../../../../assets/generated/layers/public_bookcase.json"
import LayerConfig from "../../../../Models/ThemeConfig/LayerConfig"
import { ExtractImages } from "../../../../Models/ThemeConfig/Conversion/FixImages"
import * as cyclofix from "../../../../assets/generated/themes/cyclofix.json"
import { Tag } from "../../../../Logic/Tags/Tag"
import { DesugaringContext } from "../../../../Models/ThemeConfig/Conversion/Conversion"
import { And } from "../../../../Logic/Tags/And"
import { describe, expect, it } from "vitest"

const themeConfigJson: LayoutConfigJson = {
    description: "Descr",
    icon: "",
    layers: [
        {
            builtin: "public_bookcase",
            override: {
                source: {
                    geoJson: "xyz",
                },
            },
        },
    ],
    startLat: 0,
    startLon: 0,
    startZoom: 0,
    title: {
        en: "Title",
    },
    id: "test",
}

describe("PrepareTheme", () => {
    it("should substitute layers", () => {
        const sharedLayers = new Map<string, LayerConfigJson>()
        sharedLayers.set("public_bookcase", bookcaseLayer["default"])
        const theme = { ...themeConfigJson, layers: ["public_bookcase"] }
        const prepareStep = new PrepareTheme({
            tagRenderings: new Map<string, TagRenderingConfigJson>(),
            sharedLayers: sharedLayers,
        })
        let themeConfigJsonPrepared = prepareStep.convert(theme, "test").result
        const themeConfig = new LayoutConfig(themeConfigJsonPrepared)
        const layerUnderTest = <LayerConfig>(
            themeConfig.layers.find((l) => l.id === "public_bookcase")
        )
        expect(layerUnderTest.source.osmTags).toEqual(
            new And([new Tag("amenity", "public_bookcase")])
        )
    })

    it("should apply override", () => {
        const sharedLayers = new Map<string, LayerConfigJson>()
        sharedLayers.set("public_bookcase", bookcaseLayer["default"])
        let themeConfigJsonPrepared = new PrepareTheme({
            tagRenderings: new Map<string, TagRenderingConfigJson>(),
            sharedLayers: sharedLayers,
        }).convert(themeConfigJson, "test").result
        const themeConfig = new LayoutConfig(themeConfigJsonPrepared)
        const layerUnderTest = <LayerConfig>(
            themeConfig.layers.find((l) => l.id === "public_bookcase")
        )
        expect(layerUnderTest.source.geojsonSource).toBe("xyz")
    })

    it("should apply override", () => {
        const sharedLayers = new Map<string, LayerConfigJson>()
        sharedLayers.set("public_bookcase", bookcaseLayer["default"])
        let themeConfigJsonPrepared = new PrepareTheme({
            tagRenderings: new Map<string, TagRenderingConfigJson>(),
            sharedLayers: sharedLayers,
        }).convert(
            {
                ...themeConfigJson,
                overrideAll: { source: { geoJson: "https://example.com/data.geojson" } },
            },
            "test"
        ).result
        const themeConfig = new LayoutConfig(themeConfigJsonPrepared)
        const layerUnderTest = <LayerConfig>(
            themeConfig.layers.find((l) => l.id === "public_bookcase")
        )
        expect(layerUnderTest.source.geojsonSource).toBe("https://example.com/data.geojson")
    })

    it("should remove names which are overriden with null", () => {
        const testLayer: LayerConfigJson = {
            source: {
                osmTags: "x=y",
            },
            id: "layer-example",
            name: {
                en: "Test layer - please ignore",
            },
            titleIcons: [],
            mapRendering: null,
        }
        const ctx: DesugaringContext = {
            sharedLayers: new Map<string, LayerConfigJson>([["layer-example", testLayer]]),
            tagRenderings: new Map<string, TagRenderingConfigJson>(),
        }
        const layout: LayoutConfigJson = {
            description: "A testing theme",
            icon: "",
            id: "",
            layers: [
                "layer-example",
                {
                    builtin: "layer-example",
                    override: {
                        name: null,
                        minzoom: 18,
                    },
                },
            ],
            startLat: 0,
            startLon: 0,
            startZoom: 0,
            title: "Test theme",
        }
        const rewritten = new PrepareTheme(ctx, {
            skipDefaultLayers: true,
        }).convertStrict(layout, "test")
        expect(rewritten.layers[0]).toEqual(testLayer)
        expect(rewritten.layers[1]).toEqual({
            source: {
                osmTags: "x=y",
            },
            id: "layer-example",
            name: null,
            minzoom: 18,
            mapRendering: null,
            titleIcons: [],
        })
    })
})

describe("ExtractImages", () => {
    it("should find all images in a themefile", () => {
        const images = new Set(
            new ExtractImages(true, new Set<string>()).convertStrict(<any>cyclofix, "test")
        )
        const expectedValues = [
            "./assets/layers/bike_repair_station/repair_station.svg",
            "./assets/layers/bike_repair_station/repair_station_pump.svg",
            "./assets/layers/bike_repair_station/broken_pump.svg",
            "./assets/layers/bike_repair_station/pump.svg",
            "./assets/themes/cyclofix/fietsambassade_gent_logo_small.svg",
            "./assets/layers/bike_repair_station/pump_example_manual.jpg",
            "./assets/layers/bike_repair_station/pump_example.png",
            "./assets/layers/bike_repair_station/pump_example_round.jpg",
            "./assets/layers/bike_repair_station/repair_station_example_2.jpg",
            "close",
        ]
        for (const expected of expectedValues) {
            expect(images).toEqual(expect.arrayContaining([expected]))
        }
    })
})
