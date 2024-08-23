import { BBox } from "../BBox"
import { Feature, Geometry } from "geojson"
import { DefaultPinIcon } from "../../Models/Constants"
import { Store } from "../UIEventSource"
import * as search from "../../assets/generated/layers/search.json"
import LayerConfig from "../../Models/ThemeConfig/LayerConfig"
import { LayerConfigJson } from "../../Models/ThemeConfig/Json/LayerConfigJson"
export type GeocodingCategory = "coordinate" | "city" | "house" | "street" | "locality" | "country" | "train_station" | "county" | "airport" | "shop"

export type GeoCodeResult = {
    /**
     * The name of the feature being displayed
     */
    display_name: string
    /**
     * Some optional, extra information
     */
    description?: string | Promise<string>,
    feature?: Feature,
    lat: number
    lon: number
    /**
     * Format:
     * [lat, lat, lon, lon]
     */
    boundingbox?: number[]
    osm_type?: "node" | "way" | "relation"
    osm_id?: string,
    category?: GeocodingCategory,
    payload?: object
}

export interface GeocodingOptions {
    bbox?: BBox,
    limit?: number
}


export default interface GeocodingProvider {


    search(query: string, options?: GeocodingOptions): Promise<GeoCodeResult[]>

    /**
     * @param query
     * @param options
     */
    suggest?(query: string, options?: GeocodingOptions): Store<GeoCodeResult[]>
}

export type ReverseGeocodingResult = Feature<Geometry,{
    osm_id: number,
    osm_type: "node" | "way" | "relation",
    country: string,
    city: string,
    countrycode: string,
    type: GeocodingCategory,
    street: string
} >

export interface ReverseGeocodingProvider {
    reverseSearch(
        coordinate: { lon: number; lat: number },
        zoom: number,
        language?: string
    ): Promise<ReverseGeocodingResult[]> ;
}

export class GeocodingUtils {

    public static searchLayer =  GeocodingUtils.initSearchLayer()
    private static initSearchLayer():LayerConfig{
        if(search["id"] === undefined){
            // We are resetting the layeroverview; trying to parse is useless
            return undefined
        }
        return new LayerConfig(<LayerConfigJson> search, "search")
    }

    public static categoryToZoomLevel: Record<GeocodingCategory, number> = {
        city: 12,
        county: 10,
        coordinate: 16,
        country: 8,
        house: 16,
        locality: 14,
        street: 15,
        train_station: 14,
        airport: 13,
        shop:16

    }


    public static categoryToIcon: Record<GeocodingCategory, DefaultPinIcon> = {
        city: "building_office_2",
        coordinate: "globe_alt",
        country: "globe_alt",
        house: "house",
        locality: "building_office_2",
        street: "globe_alt",
        train_station: "train",
        county: "building_office_2",
        airport: "airport",
        shop: "building_storefront"

    }

}

