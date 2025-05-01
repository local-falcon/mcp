import fetch from "node-fetch";

// Types for the API response
export interface LocalFalconLocation {
  place_id: string;
  name: string;
  address: string;
  lat: string;
  lng: string;
  rating: string;
  reviews: string;
  store_code: string;
}

export interface LocalFalconReport {
  report_key: string;
  timestamp: string;
  date: string;
  type: string;
  place_id: string;
  location: LocalFalconLocation;
  keyword: string;
  lat: string;
  lng: string;
  grid_size: string;
  radius: string;
  measurement: string;
  data_points: string;
  found_in: string;
  arp: string;
  atrp: string;
  solv: string;
}

export interface LocalFalconTrendReport {
  id: string;
  checksum: string;
  report_key: string;
  timestamp: string;
  date: string;
  looker_date: string;
  type: string;
  campaign_name: string;
  campaign_key: string;
  place_id: string;
  location: LocalFalconLocation;
  keyword: string;
  lat: string;
  lng: string;
  grid_size: string;
  radius: string;
  measurement: string;
  data_points: string;
  found_in: string;
  arp: string;
  atrp: string;
  solv: string;
  image: string;
  heatmap: string;
  pdf: string;
  public_url: string;
}

export interface LocalFalconAutoScan {
  autoscan_key: string;
  nickname: string;
  place_id: string;
  location: LocalFalconLocation;
  keyword: string;
  lat: string;
  lng: string;
  grid_size: string;
  radius: string;
  measurement: string;
  data_points: string;
  frequency: string;
  last_run_timestamp: string;
  last_run_date: string;
  next_run_timestamp: string | false;
  next_run_date: string | false;
  status: string;

}

export interface Place {
  place_id: string;
  name: string;
  address: string;
  phone: string;
  display_url: string;
  rating: string;
  reviews: string;
  arp: string;
  atrp: string;
  solv: string;
}

export interface LocalFalconReportsResponse {
  code: number;
  success: boolean;
  message: string | false;
  parameters: any[];
  data: {
    count: number;
    next_token?: string;
    ai_analysis: any;
    places: Record<string, Place>;
  };
}

export interface LocalFalconTrendReportsResponse {
  code: number;
  success: boolean;
  message: string | false;
  parameters: any[];
  data: {
    count: number;
    next_token?: string;
    reports: LocalFalconTrendReport[];
  };
}

const API_BASE = "https://api.localfalcon.com/v1";
const HEADERS = {
  "Content-Type": "application/json",
};

/**
 * Fetches scan reports from the Local Falcon API.
 * @param apiKey Your Local Falcon API key.
 * @param nextToken Optional pagination token for additional results.
 */
export async function fetchLocalFalconReports(apiKey: string, nextToken?: string): Promise<LocalFalconReportsResponse> {
  const url = new URL(`${API_BASE}/reports`);
  url.searchParams.set("api_key", apiKey);

  if (nextToken) url.searchParams.set("next_token", nextToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data as LocalFalconReportsResponse;
}

/**
 * Fetches scan reports from the Local Falcon API.
 * @param apiKey Your Local Falcon API key.
 * @param nextToken Optional pagination token for additional results.
 */
export async function fetchLocalFalconTrendReports(apiKey: string, nextToken?: string, limit?: string, placeId?: string, keyword?: string): Promise<LocalFalconTrendReportsResponse> {
  const url = new URL(`${API_BASE}/trend-reports`);
  url.searchParams.set("api_key", apiKey);

  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (limit) url.searchParams.set("limit", limit);
  if (placeId) url.searchParams.set("place_id", placeId);
  if (keyword) url.searchParams.set("keyword", keyword);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data as LocalFalconTrendReportsResponse;
}

export async function fetchLocalFalconAutoScans(apiKey: string, nextToken?: string, placeId?: string, keyword?: string, grid_size?: string, frequency?: string, status?: string): Promise<any> {
  const url = new URL(`${API_BASE}/autoscans`);
  url.searchParams.set("api_key", apiKey);

  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (placeId) url.searchParams.set("place_id", placeId);
  if (keyword) url.searchParams.set("keyword", keyword);
  if (grid_size) url.searchParams.set("grid_size", grid_size);
  if (frequency) url.searchParams.set("frequency", frequency);
  if (status) url.searchParams.set("status", status);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data;
}


export async function fetchLocalFalconLocationReports(apiKey: string, limit?: string, placeId?: string, keyword?: string, nextToken?: string): Promise<any> {
  const url = new URL(`${API_BASE}/location-reports`);
  url.searchParams.set("api_key", apiKey);

  if (limit) url.searchParams.set("limit", limit);
  if (placeId) url.searchParams.set("place_id", placeId);
  if (keyword) url.searchParams.set("keyword", keyword);
  if (nextToken) url.searchParams.set("next_token", nextToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as any;
  const report = data.data
  return {
    next_token: report.next_token,
    ai_analysis: report.ai_analysis,
    reports: report.reports.map((report: any) => {
      return {
        report_key: report.report_key,
        last_date: report.last_date,
        location: report.location,
        keywords: report.keywords,
        pdf: report.pdf,
        avg_arp: report.avg_arp,
        avg_atrp: report.avg_atrp,
        avg_solv: report.avg_solv,
      }
    }),
  }
}

export async function fetchAllLocalFalconLocations(apiKey: string, query?: string): Promise<any> {
  const url = new URL(`${API_BASE}/locations`);
  url.searchParams.set("api_key", apiKey);

  if (query) url.searchParams.set("query", query);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data;
}

export async function fetchLocalFalconLocationReport(apiKey: string, reportKey: string): Promise<any> {
  const url = new URL(`${API_BASE}/location-reports/${reportKey}`);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data;
}

export async function fetchLocalFalconReport(apiKey: string, reportKey: string): Promise<any> {
  const url = new URL(`${API_BASE}/reports/${reportKey}`);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as any;
  try {
    // trim response
    const report = data.data;
    // const aiAnalysis = report.ai_analysis;
    // const places = Object.values(report.places).map((place: any) => {
    //   return {
    //     place_id: place.place_id,
    //     name: place.name,
    //     address: place.address,
    //     phone: place.phone,
    //     display_url: place.display_url,
    //     rating: place.rating,
    //     reviews: place.reviews,
    //     arp: place.arp,
    //     atrp: place.atrp,
    //     solv: place.solv,
    //   };
    // });

    // return {
    //   report_key: report.report_key,
    //   timestamp: report.timestamp,
    //   date: report.date,
    //   place_id: report.place_id,
    //   location: report.location,
    //   keyword: report.keyword,
    //   lat: report.lat,
    //   lng: report.lng,
    //   grid_size: report.grid_size,
    //   radius: report.radius,
    //   measurement: report.measurement,
    //   ai_analysis: aiAnalysis,
    //   places: places,
    // };
    return {
      report_key: report.report_key,
      timestamp: report.timestamp,
      date: report.date,
      place_id: report.place_id,
      location: report.location,
      keyword: report.keyword,
      lat: report.lat,
      lng: report.lng,
      grid_size: report.grid_size,
      radius: report.radius,
      measurement: report.measurement,
      ai_analysis: report.ai_analysis,
    }
  } catch (err) {
    throw new Error(`Failed to parse JSON from Local Falcon API. ${err}`);
  }
}

export async function fetchLocalFalconTrendReport(apiKey: string, reportKey: string): Promise<any> {
  const url = new URL(`${API_BASE}/trend-reports/${reportKey}`);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as any;
  const report = data.data

  // get the most number of locations from one of the scans to save context space
  let locations = report.scans.reduce((most: any, current: any) => {
    return current.locations.length > most.length ? current.locations : most;
  }, [] as any[])
  locations = locations.map((location: any) => {
    return {
      place_id: location.place_id,
      name: location.name,
      address: location.address,
      phone: location.phone,
      display_url: location.display_url,
      rating: location.rating,
      reviews: location.reviews,
      arp: location.arp,
      atrp: location.atrp,
      solv: location.solv,
    };
  });

  return {
    id: report.id,
    last_date: report.last_date,
    keyword: report.keyword,
    location: report.location,
    ai_analysis: report.ai_analysis,
    lat: report.lat,
    lng: report.lng,
    grid_size: report.grid_size,
    radius: report.radius,
    measurement: report.measurement,
    scan_count: report.scan_count,
    points: report.points,
    pdf: report.pdf,
    locations,
    scans: report.scans.map((scan: any) => {
      return {
        report_key: scan.report_key,
        date: scan.date,
        arp: scan.arp,
        atrp: scan.atrp,
        solv: scan.solv,
        image: scan.image,
        heatmap: scan.heatmap
      }
    }),
  }

  return data;
}

export async function fetchLocalFalconKeywordReports(apiKey: string, nextToken?: string, limit?: string, keyword?: string): Promise<any> {
  const url = new URL(`${API_BASE}/keyword-reports`);
  url.searchParams.set("api_key", apiKey);

  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (limit) url.searchParams.set("limit", limit);
  if (keyword) url.searchParams.set("keyword", keyword);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data;
}

export async function fetchLocalFalconKeywordReport(apiKey: string, reportKey: string): Promise<any> {
  const url = new URL(`${API_BASE}/keyword-reports/${reportKey}`);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data;
}

export async function fetchLocalFalconGrid(apiKey: string, lat?: string, lng?: string, gridSize?: string, radius?: string, measurement?: string): Promise<any> {
  const url = new URL(`${API_BASE}/grid`);
  url.searchParams.set("api_key", apiKey);

  if (lat) url.searchParams.set("lat", lat);
  if (lng) url.searchParams.set("lng", lng);
  if (gridSize) url.searchParams.set("grid_size", gridSize.toString());
  if (radius) url.searchParams.set("radius", radius.toString());
  if (measurement) url.searchParams.set("measurement", measurement);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data;
}

export async function fetchLocalFalconGoogleBusinessLocations(apiKey: string, nextToken?: string, query?: string, near?: string): Promise<any> {
  const url = new URL(`${API_BASE}/places`);
  url.searchParams.set("api_key", apiKey);

  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (query) url.searchParams.set("query", query);
  if (near) url.searchParams.set("near", near);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data;
}

export async function fetchLocalFalconRankingAtCoordinate(apiKey: string, lat: string, lng: string, keyword: string, zoom: string): Promise<any> {
  const url = new URL(`${API_BASE}/result`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lng", lng);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("zoom", zoom);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
  }
  return data;
}

export async function fetchLocalFalconKeywordAtCoordinate(apiKey: string, lat: string, lng: string, keyword: string, zoom: string): Promise<any> {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lng", lng);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("zoom", zoom.toString());

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: HEADERS,
    });

    if (!res.ok) {
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
    }

    const raw = await res.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('Raw response from Local Falcon API:', raw);
      throw new Error('Failed to parse JSON from Local Falcon API. See raw response above.');
    }
    return data;
  } catch (err) {
    throw new Error(`Failed to fetch Local Falcon keyword at coordinate: ${err}`);
  }
}

export async function fetchLocalFalconFullGridSearch(apiKey: string, placeId: string, keyword: string, lat: string, lng: string, gridSize: string, radius: string, measurement: string): Promise<any> {
  const url = new URL(`${API_BASE}/scan`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lng", lng);
  url.searchParams.set("grid_size", gridSize);
  url.searchParams.set("radius", radius);
  url.searchParams.set("measurement", measurement);

  try {
    // kick off the request
    const res = fetch(url.toString(), {
      method: "GET",
      headers: HEADERS,
    });

    return {
      message: `Local Falcon full grid search started with params ${JSON.stringify({ placeId, keyword, lat, lng, gridSize, radius, measurement })}`,
    }
  } catch (err) {
    throw new Error(`Failed to fetch Local Falcon full grid search: ${err}`);
  }
}