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
  const url = new URL("https://www.localfalcon.com/api/v1/reports");
  if (nextToken) {
    url.searchParams.set("next_token", nextToken);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Local Falcon API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data as LocalFalconReportsResponse;
}
