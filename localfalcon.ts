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

export interface LocalFalconReportsResponse {
  code: number;
  success: boolean;
  message: string | false;
  parameters: any[];
  data: {
    count: number;
    next_token?: string;
    reports: LocalFalconReport[];
  };
}

/**
 * Fetches scan reports from the Local Falcon API.
 * @param apiKey Your Local Falcon API key.
 * @param nextToken Optional pagination token for additional results.
 */
export async function fetchLocalFalconReports(apiKey: string, nextToken?: string): Promise<LocalFalconReportsResponse> {
  const url = new URL("https://api.localfalcon.com/v1/reports");
  url.searchParams.set("api_key", apiKey);
  
  if (nextToken) {
    url.searchParams.set("next_token", nextToken);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
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
