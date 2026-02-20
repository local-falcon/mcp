import fetch from "node-fetch";
import { AbortController } from "abort-controller";

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
const API_BASE_V2 = "https://api.localfalcon.com/v2";
const HEADERS = {
  "Content-Type": "application/json",
};

// Configuration
const DEFAULT_TIMEOUT_MS = 30000;
const LONG_OPERATION_TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 1000;

/**
 * Enhanced fetch with timeout and cancellation support
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} - Fetch response
 */
async function fetchWithTimeout(url: string, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const { signal } = controller;

  // Create a timeout that will abort the request
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Rate limiting implementation
class RateLimiter {
  maxRequests: number;
  timeWindowMs: number;
  requestTimestamps: number[];

  constructor(maxRequests = RATE_LIMIT_MAX_REQUESTS, timeWindowMs = RATE_LIMIT_WINDOW_MS) {
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
    this.requestTimestamps = [];
  }

  async waitForAvailableSlot(): Promise<void> {
    const now = Date.now();
    // Remove timestamps older than the time window
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.timeWindowMs
    );

    if (this.requestTimestamps.length >= this.maxRequests) {
      // Calculate delay needed to respect rate limit
      const oldestRequest = this.requestTimestamps[0];
      const delay = this.timeWindowMs - (now - oldestRequest);

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.waitForAvailableSlot(); // Recursively check again
      }
    }

    // Add current request timestamp
    this.requestTimestamps.push(Date.now());
  }
}

// Create a singleton rate limiter
const rateLimiter = new RateLimiter();

// Helper to determine if an error is retryable
function isRetryableError(error: Error) {
  // Network errors, 5xx responses, and timeouts are retryable
  return error.name === 'AbortError' ||
    error.message.includes('network') ||
    error.message.includes('timeout') ||
    (error.message.includes('API error: 5'));
}

// Retry mechanism with exponential backoff
async function withRetry(fn: () => Promise<any>, maxRetries = MAX_RETRIES, initialDelayMs = INITIAL_RETRY_DELAY_MS) {
  let retries = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      if (retries > maxRetries || !isRetryableError(error as Error)) {
        throw error;
      }

      const delayMs = initialDelayMs * Math.pow(2, retries - 1);
      console.log(`Retrying after ${delayMs}ms (attempt ${retries}/${maxRetries}): ${error}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Helper function to safely parse JSON from API response
 * @param {Response} response - Fetch Response object
 * @returns {Promise<any>} Parsed JSON data
 */
async function safeParseJson(response: any) {
  const raw = await (response as Response).text();
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('Raw response from Local Falcon API:', raw);
    throw new Error('Failed to parse JSON from Local Falcon API response');
  }
}

/**
 * Fetches scan reports from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} limit - Maximum number of results to return
 * @param {string} nextToken - Optional pagination token for additional results
 * @param {string} startDate - Optional start date to filter reports (format: YYYY-MM-DD)
 * @param {string} endDate - Optional end date to filter reports (format: YYYY-MM-DD)
 * @returns {Promise<LocalFalconReportsResponse>} API response
 */
export async function fetchLocalFalconReports(apiKey: string, limit: string, nextToken?: string, startDate?: string, endDate?: string, placeId?: string, keyword?: string, gridSize?: string, campaignKey?: string, platform?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/reports`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", limit);
  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  if (placeId) url.searchParams.set("place_id", placeId);
  if (keyword) url.searchParams.set("keyword", keyword);
  if (gridSize) url.searchParams.set("grid_size", gridSize);
  if (campaignKey) url.searchParams.set("campaign_key", campaignKey);
  if (platform) url.searchParams.set("platform", platform);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    // Validate response structure before processing
    if (!data || !data.data || !data.data.reports) {
      throw new Error('Invalid response format from Local Falcon API');
    }

    return {
      ...data.data,
      reports: data.data.reports.slice(0, parseInt(limit) || data.data.reports.length)
    };
  });
}

/**
 * Fetches trend reports from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} limit - Maximum number of results to return
 * @param {string} nextToken - Optional pagination token for additional results
 * @param {string} placeId - Optional place ID to filter by
 * @param {string} keyword - Optional keyword to filter by
 * @returns {Promise<LocalFalconTrendReportsResponse>} API response
 */
export async function fetchLocalFalconTrendReports(apiKey: string, limit: string, nextToken?: string, placeId?: string, keyword?: string, startDate?: string, endDate?: string, platform?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/trend-reports`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", limit);
  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (placeId) url.searchParams.set("place_id", placeId);
  if (keyword) url.searchParams.set("keyword", keyword);
  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  if (platform) url.searchParams.set("platform", platform);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    // Validate response structure
    if (!data || !data.data || !data.data.reports) {
      throw new Error('Invalid response format from Local Falcon API');
    }

    return {
      ...data.data,
      reports: data.data.reports.slice(0, parseInt(limit) || data.data.reports.length)
    };
  });
}

/**
 * Fetches auto scans from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} nextToken - Optional pagination token
 * @param {string} placeId - Optional place ID filter
 * @param {string} keyword - Optional keyword filter
 * @param {string} grid_size - Optional grid size filter
 * @param {string} frequency - Optional frequency filter
 * @param {string} status - Optional status filter
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconAutoScans(apiKey: string, nextToken?: string, placeId?: string, keyword?: string, grid_size?: string, frequency?: string, status?: string, platform?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/autoscans`);
  url.searchParams.set("api_key", apiKey);

  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (placeId) url.searchParams.set("place_id", placeId);
  if (keyword) url.searchParams.set("keyword", keyword);
  if (grid_size) url.searchParams.set("grid_size", grid_size);
  if (frequency) url.searchParams.set("frequency", frequency);
  if (status) url.searchParams.set("status", status);
  if (platform) url.searchParams.set("platform", platform);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches location reports from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} limit - Maximum number of results
 * @param {string} placeId - Optional place ID filter
 * @param {string} keyword - Optional keyword filter
 * @param {string} nextToken - Optional pagination token
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconLocationReports(apiKey: string, limit: string, placeId?: string, keyword?: string, startDate?:string, endDate?: string, nextToken?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/location-reports`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", limit);

  if (placeId) url.searchParams.set("place_id", placeId);
  if (keyword) url.searchParams.set("keyword", keyword);
  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    // Validate response
    if (!data || !data.data || !data.data.reports) {
      throw new Error('Invalid response format from Local Falcon API');
    }

    const report = data.data;
    const limitNum = parseInt(limit) || report.reports.length;

    return {
      next_token: report.next_token,
      ai_analysis: report.ai_analysis,
      reports: report.reports.slice(0, limitNum).map((report: any) => {
        return {
          report_key: report.report_key,
          last_date: report.last_date,
          location: report.location,
          keywords: report.keywords,
          pdf: report.pdf,
          avg_arp: report.avg_arp,
          avg_atrp: report.avg_atrp,
          avg_solv: report.avg_solv,
        };
      }),
    };
  });
}

/**
 * Fetches all locations from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} query - Optional search query
 * @returns {Promise<any>} API response
 */
export async function fetchAllLocalFalconLocations(apiKey: string, query?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/locations`);
  url.searchParams.set("api_key", apiKey);

  if (query) url.searchParams.set("query", query);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches a location report from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} reportKey - The report key
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconLocationReport(apiKey: string, reportKey: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/location-reports/${reportKey}`);
  url.searchParams.set("api_key", apiKey);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches a report from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} reportKey - The report key
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconReport(apiKey: string, reportKey: string, fieldmask?: string) {
  // Clean up the report key if it's a URL
  const cleanReportKey = reportKey.includes('/')
    ? reportKey.split('/').pop()
    : reportKey;

  const url = new URL(`${API_BASE}/reports/${cleanReportKey}`);
  url.searchParams.set("api_key", apiKey);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    try {
      // Validate the response
      if (!data || !data.data) {
        throw new Error('Invalid response format from Local Falcon API');
      }

      // Strip data_points — too large for LLM context windows (e.g. 81 grid points × 20 results each)
      const { data_points, ...cleanData } = data.data;
      return cleanData;
    } catch (err) {
      throw new Error(`Failed to parse report data: ${err}`);
    }
  });
}

/**
 * Fetches a trend report from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} reportKey - The report key
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconTrendReport(apiKey: string, reportKey: string, fieldmask?: string) {
  // Clean up the report key if it's a URL
  const cleanReportKey = reportKey.includes('/')
    ? reportKey.split('/').pop()
    : reportKey;

  const url = new URL(`${API_BASE}/trend-reports/${cleanReportKey}`);
  url.searchParams.set("api_key", apiKey);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    // Validate the response
    if (!data || !data.data || !data.data.scans) {
      throw new Error('Invalid response format from Local Falcon API');
    }

    const report = data.data;

    // Get the most number of locations from one of the scans to save context space
    let locations = report.scans.reduce((most: any[], current: any) => {
      return current.locations && current.locations.length > most.length ? current.locations : most;
    }, []);

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
        };
      }),
    };
  });
}

/**
 * Fetches keyword reports from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} limit - Maximum number of results
 * @param {string} nextToken - Optional pagination token
 * @param {string} keyword - Optional keyword filter
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconKeywordReports(apiKey: string, limit: string, nextToken?: string, keyword?: string, startDate?: string, endDate?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/keyword-reports`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", limit);

  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  if (keyword) url.searchParams.set("keyword", keyword);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    // Validate the response
    if (!data || !data.data || !data.data.reports) {
      throw new Error('Invalid response format from Local Falcon API');
    }

    const limitNum = parseInt(limit) || data.data.reports.length;

    return {
      ...data.data,
      reports: data.data.reports.slice(0, limitNum).map((report: any) => {
        // Remove unnecessary fields to save bandwidth
        const { last_timestamp, looker_last_date, scan_count, pdf, ...cleanReport } = report;
        return cleanReport;
      })
    };
  });
}

/**
 * Fetches a keyword report from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} reportKey - The report key
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconKeywordReport(apiKey: string, reportKey: string, fieldmask?: string) {
  // Clean up the report key if it's a URL
  const cleanReportKey = reportKey.includes('/')
    ? reportKey.split('/').pop()
    : reportKey;

  const url = new URL(`${API_BASE}/keyword-reports/${cleanReportKey}`);
  url.searchParams.set("api_key", apiKey);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches a grid from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} lat - Latitude
 * @param {string} lng - Longitude
 * @param {string} gridSize - Grid size
 * @param {string} radius - Radius
 * @param {string} measurement - Measurement unit
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconGrid(apiKey: string, lat?: string, lng?: string, gridSize?: string, radius?: string, measurement?: string) {
  const url = new URL(`${API_BASE}/grid`);
  url.searchParams.set("api_key", apiKey);

  if (lat) url.searchParams.set("lat", lat);
  if (lng) url.searchParams.set("lng", lng);
  if (gridSize) url.searchParams.set("grid_size", gridSize.toString());
  if (radius) url.searchParams.set("radius", radius.toString());
  if (measurement) url.searchParams.set("measurement", measurement);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches Google Business locations from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} nextToken - Optional pagination token
 * @param {string} query - Search query
 * @param {string} near - Optional location filter
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconGoogleBusinessLocations(apiKey: string, nextToken?: string, query?: string, near?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/places`);
  url.searchParams.set("api_key", apiKey);

  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (query) url.searchParams.set("query", query);
  if (near) url.searchParams.set("near", near);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches ranking data for a business at a coordinate.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} lat - Latitude
 * @param {string} lng - Longitude
 * @param {string} keyword - Search keyword
 * @param {string} zoom - Map zoom level
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconRankingAtCoordinate(apiKey: string, lat: string, lng: string, keyword: string, zoom = "13") {
  const url = new URL(`${API_BASE}/result`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lng", lng);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("zoom", zoom);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches search results at a coordinate without rank comparison.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} lat - Latitude
 * @param {string} lng - Longitude
 * @param {string} keyword - Search keyword
 * @param {string} zoom - Map zoom level
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconKeywordAtCoordinate(apiKey: string, lat: string, lng: string, keyword: string, zoom = "13") {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lng", lng);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("zoom", zoom.toString());

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    }, LONG_OPERATION_TIMEOUT_MS); // Longer timeout for search operations

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Runs a full grid search using Local Falcon API v2.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} placeId - The Google Place ID of the business to match against
 * @param {string} keyword - The desired search term or keyword
 * @param {string} lat - The data point latitude value
 * @param {string} lng - The data point longitude value
 * @param {string} gridSize - Grid size (3, 5, 7, 9, 11, 13, or 15)
 * @param {string} radius - Radius from center point (.1 to 100)
 * @param {string} measurement - Measurement unit ("mi" for miles or "km" for kilometers)
 * @param {string} platform - Platform to run scan against ("google", "apple", "gaio", or "chatgpt")
 * @param {boolean} aiAnalysis - Whether AI analysis should be generated (optional)
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconFullGridSearch(
  apiKey: string,
  placeId: string,
  keyword: string,
  lat: string,
  lng: string,
  gridSize: string,
  radius: string,
  measurement: string,
  platform: string,
  aiAnalysis: boolean = false
) {
  const url = "https://api.localfalcon.com/v2/run-scan/";
  
  const formData = new FormData();
  formData.append("api_key", apiKey);
  formData.append("place_id", placeId);
  formData.append("keyword", keyword);
  formData.append("lat", lat);
  formData.append("lng", lng);
  formData.append("grid_size", gridSize);
  formData.append("radius", radius);
  formData.append("measurement", measurement);
  formData.append("platform", platform);
  formData.append("ai_analysis", aiAnalysis.toString());
  const isEager = platform != "google"
  formData.append("eager", isEager.toString())

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      body: formData,
    }, LONG_OPERATION_TIMEOUT_MS); // Long timeout for grid searches

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const responseData = await safeParseJson(res);


    console.info(`Is eager is: ${isEager}`)
    console.info(`Platform is: ${platform}`)
    if (isEager) console.info(`Raw eager response is ${JSON.stringify(responseData, null, 2)}`)
    
    const data = responseData.data;
    const { data_points, rankings, ...rest } = data;
    const parameters = responseData.parameters;
    const result = {
      parameters,
      rest,
      message: responseData.message,
      url: `https://www.localfalcon.com/reports/view/${rest.report_key}`
    }
    console.info(`response is: ${JSON.stringify(result, null, 2)}`)

    return {
      success: true,
      ...result
    };
  });
}

/**
 * Fetches competitor reports from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} limit - Maximum number of results
 * @param {string} startDate - Optional start date filter
 * @param {string} endDate - Optional end date filter
 * @param {string} placeId - Optional place ID filter
 * @param {string} keyword - Optional keyword filter
 * @param {string} gridSize - Optional grid size filter
 * @param {string} nextToken - Optional pagination token
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconCompetitorReports(apiKey: string, limit: string, startDate?: string, endDate?: string, placeId?: string, keyword?: string, gridSize?: string, nextToken?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/competitor-reports`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", limit);

  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  if (placeId) url.searchParams.set("place_id", placeId);
  if (keyword) url.searchParams.set("keyword", keyword);
  if (gridSize) url.searchParams.set("grid_size", gridSize);
  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    // Validate the response
    if (!data || !data.data || !data.data.reports) {
      throw new Error('Invalid response format from Local Falcon API');
    }

    const limitNum = parseInt(limit) || data.data.reports.length;

    return {
      ...data.data,
      reports: data.data.reports.slice(0, limitNum).map((report: any) => {
        // Remove unnecessary fields to save bandwidth
        const {
          data_points,
          checksum,
          timestamp,
          looker_date,
          pdf,
          ...cleanReport
        } = report;
        return cleanReport;
      })
    };
  });
}

/**
 * Fetches a competitor report from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} reportKey - Report key
 * @param {string} [fieldmask] - Optional fieldmask for server-side field filtering
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconCompetitorReport(apiKey: string, reportKey: string, fieldmask?: string) {
  // Clean up the report key if it's a URL
  const cleanReportKey = reportKey.includes('/')
    ? reportKey.split('/').pop()
    : reportKey;

  const url = new URL(`${API_BASE}/competitor-reports/${cleanReportKey}`);
  url.searchParams.set("api_key", apiKey);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches campaign reports from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} limit - Maximum number of results
 * @param {string} startDate - Optional start date filter
 * @param {string} endDate - Optional end date filter
 * @param {string} placeId - Optional place ID filter
 * @param {string} nextToken - Optional pagination token
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconCampaignReports(apiKey: string, limit: string, startDate?: string, endDate?: string, placeId?: string, runDate?: string, nextToken?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/campaigns`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", limit);

  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  if (placeId) url.searchParams.set("place_id", placeId);
  if (runDate) url.searchParams.set("run", runDate);
  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    // Validate the response
    if (!data || !data.data || !data.data.reports) {
      throw new Error('Invalid response format from Local Falcon API');
    }

    const limitNum = parseInt(limit) || data.data.reports.length;

    return {
      ...data.data,
      reports: data.data.reports.slice(0, limitNum).map((report: any) => {
        // Remove only truly unnecessary fields
        const {
          data_points,
          ...cleanReport
        } = report;
        return cleanReport;
      })
    };
  });
}

/**
 * Fetches a campaign report from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} reportKey - Report key
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconCampaignReport(apiKey: string, reportKey: string, runDate:string, fieldmask?: string) {
  // Clean up the report key if it's a URL
  const cleanReportKey = reportKey.includes('/')
    ? reportKey.split('/').pop()
    : reportKey;

  const url = new URL(`${API_BASE}/campaigns/${cleanReportKey}`);
  url.searchParams.set("api_key", apiKey);

  if (runDate) url.searchParams.set("run", runDate);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    }, LONG_OPERATION_TIMEOUT_MS); // Campaign reports can be large

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches guard reports from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} limit - Maximum number of results
 * @param {string} startDate - Optional start date filter
 * @param {string} endDate - Optional end date filter
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconGuardReports(apiKey: string, limit: string, startDate?: string, endDate?: string, status?: string, nextToken?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/guard`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", limit);

  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  if (status) url.searchParams.set("status", status);
  if (nextToken) url.searchParams.set("next_token", nextToken);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);
  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await safeParseJson(res);

    // Validate the response
    if (!data || !data.data || !data.data.reports) {
      throw new Error('Invalid response format from Local Falcon API');
    }

    const limitNum = parseInt(limit) || data.data.reports.length;

    return {
      ...data.data,
      reports: data.data.reports.slice(0, limitNum)
    };
  });
}

/**
 * Fetches a guard report from the Local Falcon API.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} placeId - Place ID
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconGuardReport(apiKey: string, placeId: string, startDate?: string, endDate?: string, fieldmask?: string) {
  const url = new URL(`${API_BASE}/guard/${placeId}`);
  url.searchParams.set("api_key", apiKey);
  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  if (fieldmask) url.searchParams.set("fieldmask", fieldmask);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Runs a scan at the specified coordinate point and gets ranking data for a specified business.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} placeId - The Google Place ID of the business to match against in results
 * @param {string} keyword - The desired search term or keyword
 * @param {string} lat - The data point latitude value
 * @param {string} lng - The data point longitude value
 * @param {string} gridSize - The size of the grid (3, 5, 7, 9, 11, 13, or 15)
 * @param {string} radius - The radius of the grid from center point to outer most north/east/south/west point (0.1 to 100)
 * @param {string} measurement - The measurement unit of the radius ("mi" for miles or "km" for kilometers)
 * @param {string} platform - The platform to run the scan against ("google", "apple", "gaio", or "chatgpt")
 * @param {boolean} [aiAnalysis=false] - Whether AI analysis should be generated for this scan (optional)
 * @returns {Promise<any>} API response with scan results
 */
export async function runLocalFalconScan(
  apiKey: string,
  placeId: string,
  keyword: string,
  lat: string,
  lng: string,
  gridSize: string,
  radius: string,
  measurement: string,
  platform: string,
  aiAnalysis: boolean = false
): Promise<any> {
  try {
    // Wait for rate limiter before making the request
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('place_id', placeId);
    form.append('keyword', keyword);
    form.append('lat', lat);
    form.append('lng', lng);
    form.append('grid_size', gridSize);
    form.append('radius', radius);
    form.append('measurement', measurement);
    form.append('platform', platform);
    form.append('ai_analysis', aiAnalysis.toString());
    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/run-scan/`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    // Parse and return the response
    const data = await safeParseJson(response);
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error running scan:', error);
    throw error;
  }
}

/**
 * Searches for business locations on the specified platform.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} term - The business location name to search for
 * @param {string} platform - The platform to search against ("google" or "apple")
 * @param {string} [proximity] - Optional proximity filter (e.g., city, state, country)
 * @returns {Promise<any>} API response with matching business locations
 */
export async function searchForLocalFalconBusinessLocation(
  apiKey: string,
  term: string,
  platform: string,
  proximity?: string
): Promise<any> {
  try {
    // Wait for rate limiter before making the request
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('term', term);
    form.append('platform', platform);
    if (proximity) form.append('proximity', proximity);
    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/locations/search`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    // Parse and return the response
    const data = await safeParseJson(response);
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error searching business locations:', error);
    throw error;
  }
}

/**
 * Saves a business location to your Local Falcon account.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} platform - The platform to add the location from ("google" or "apple")
 * @param {string} placeId - The Business Location ID to add
 * @param {string} [name] - Business name (required for Apple)
 * @param {string} [lat] - Latitude (required for Apple)
 * @param {string} [lng] - Longitude (required for Apple)
 * @returns {Promise<any>} API response
 */
export async function saveLocalFalconBusinessLocationToAccount(
  apiKey: string,
  platform: 'google' | 'apple',
  placeId: string,
  name?: string,
  lat?: string,
  lng?: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('platform', platform);
    form.append('place_id', placeId);
    if (name) form.append('name', name);
    if (lat) form.append('lat', lat);
    if (lng) form.append('lng', lng);
    
    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/locations/add`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error saving business location:', error);
    throw error;
  }
}


/**
 * Retrieves Local Falcon account information.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} [returnField] - Optional specific return information: "user", "credit package", "subscription", or "credits"
 * @returns {Promise<any>} API response with account details
 */
export async function fetchLocalFalconAccountInfo(
  apiKey: string,
  returnField?: 'user' | 'credit package' | 'subscription' | 'credits',
  fieldmask?: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    if (returnField) form.append('return', returnField);
    if (fieldmask) form.append('fieldmask', fieldmask);
    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/account`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error fetching account information:', error);
    throw error;
  }
}

export async function addLocationsToFalconGuard(
  apiKey: string,
  placeIds: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('place_id', placeIds);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/guard/add`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error adding locations to Falcon Guard:', error);
    throw error;
  }
}

/**
 * Pauses protection for one or multiple locations in Falcon Guard.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} [guardKey] - Falcon Guard report key(s), separated by commas
 * @param {string} [placeId] - Google Place ID(s), separated by commas (required if guardKey is blank)
 * @returns {Promise<any>} API response
 */
export async function pauseFalconGuardProtection(
  apiKey: string,
  guardKey?: string,
  placeId?: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    if (guardKey) form.append('guard_key', guardKey);
    if (placeId) form.append('place_id', placeId);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/guard/pause`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error pausing Falcon Guard protection:', error);
    throw error;
  }
}

/**
 * Resumes protection for one or multiple locations in Falcon Guard.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} [guardKey] - Falcon Guard report key(s), separated by commas
 * @param {string} [placeId] - Google Place ID(s), separated by commas (required if guardKey is blank)
 * @returns {Promise<any>} API response
 */
export async function resumeFalconGuardProtection(
  apiKey: string,
  guardKey?: string,
  placeId?: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    if (guardKey) form.append('guard_key', guardKey);
    if (placeId) form.append('place_id', placeId);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/guard/resume`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error resuming Falcon Guard protection:', error);
    throw error;
  }
}

/**
 * Removes protection for one or multiple locations from Falcon Guard.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} [guardKey] - Falcon Guard report key(s), separated by commas
 * @param {string} [placeId] - Google Place ID(s), separated by commas (required if guardKey is blank)
 * @returns {Promise<any>} API response
 */
export async function removeFalconGuardProtection(
  apiKey: string,
  guardKey?: string,
  placeId?: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    if (guardKey) form.append('guard_key', guardKey);
    if (placeId) form.append('place_id', placeId);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/guard/delete`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error removing Falcon Guard protection:', error);
    throw error;
  }
}

/**
 * Creates a new campaign in Local Falcon.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {object} params - Campaign parameters
 * @returns {Promise<any>} API response
 */
export async function createLocalFalconCampaign(
  apiKey: string,
  params: {
    name: string;
    measurement: 'mi' | 'km';
    gridSize: string;
    radius: string;
    frequency: 'one-time' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
    placeId: string;
    keyword: string;
    startDate: string;
    startTime: string;
    aiAnalysis?: boolean;
    notify?: boolean;
    emailRecipients?: string;
    emailSubject?: string;
    emailBody?: string;
  }
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('name', params.name);
    form.append('measurement', params.measurement);
    form.append('grid_size', params.gridSize);
    form.append('radius', params.radius);
    form.append('frequency', params.frequency);
    form.append('place_id', params.placeId);
    form.append('keyword', params.keyword);
    form.append('start_date', params.startDate);
    form.append('start_time', params.startTime);
    if (params.aiAnalysis !== undefined) form.append('ai_analysis', params.aiAnalysis ? '1' : '0');
    if (params.notify !== undefined) form.append('notify', params.notify ? '1' : '0');
    if (params.emailRecipients) form.append('email_recipients', params.emailRecipients);
    if (params.emailSubject) form.append('email_subject', params.emailSubject);
    if (params.emailBody) form.append('email_body', params.emailBody);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/campaigns/create`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error creating campaign:', error);
    throw error;
  }
}

/**
 * Manually triggers a campaign to run immediately.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} campaignKey - The key of the campaign to run
 * @returns {Promise<any>} API response
 */
export async function runLocalFalconCampaign(
  apiKey: string,
  campaignKey: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('campaign_key', campaignKey);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/campaigns/run`,
        {
          method: 'POST',
          body: form,
        },
        LONG_OPERATION_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error running campaign:', error);
    throw error;
  }
}

/**
 * Pauses a campaign.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} campaignKey - The key of the campaign to pause
 * @returns {Promise<any>} API response
 */
export async function pauseLocalFalconCampaign(
  apiKey: string,
  campaignKey: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('campaign_key', campaignKey);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/campaigns/pause`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error pausing campaign:', error);
    throw error;
  }
}

/**
 * Resumes a campaign from a deactivated or paused status.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} campaignKey - The key of the campaign to resume
 * @param {string} [startDate] - Optional date to resume and run the campaign (MM/DD/YYYY)
 * @param {string} [startTime] - Optional time of day the campaign should next run (e.g., "9:00 AM")
 * @returns {Promise<any>} API response
 */
export async function resumeLocalFalconCampaign(
  apiKey: string,
  campaignKey: string,
  startDate?: string,
  startTime?: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('campaign_key', campaignKey);
    if (startDate) form.append('start_date', startDate);
    if (startTime) form.append('start_time', startTime);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/campaigns/resume`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error resuming campaign:', error);
    throw error;
  }
}

/**
 * Reactivates a campaign that was deactivated due to insufficient credits.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} campaignKey - The key of the campaign to reactivate
 * @returns {Promise<any>} API response
 */
export async function reactivateLocalFalconCampaign(
  apiKey: string,
  campaignKey: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('campaign_key', campaignKey);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE_V2}/campaigns/reactivate`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error reactivating campaign:', error);
    throw error;
  }
}

/**
 * Retrieves the full list of all Reviews Analysis Reports.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} [reviewsKey] - Filter by parent Reviews Analysis record key
 * @param {string} [placeId] - Filter by platform Place ID(s), comma-separated
 * @param {string} [frequency] - Filter by analysis frequency
 * @param {number} [limit] - Number of results (1-100, defaults to 10)
 * @param {string} [nextToken] - Pagination token for next page
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconReviewsAnalysisReports(
  apiKey: string,
  reviewsKey?: string,
  placeId?: string,
  frequency?: string,
  limit?: number,
  nextToken?: string,
  fieldmask?: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    if (reviewsKey) form.append('reviews_key', reviewsKey);
    if (placeId) form.append('place_id', placeId);
    if (frequency) form.append('frequency', frequency);
    if (limit !== undefined) form.append('limit', limit.toString());
    if (nextToken) form.append('next_token', nextToken);
    if (fieldmask) form.append('fieldmask', fieldmask);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE}/reviews/`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error fetching reviews analysis reports:', error);
    throw error;
  }
}

/**
 * Retrieves a specific Reviews Analysis Report.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} reportKey - The key of the report to retrieve
 * @returns {Promise<any>} API response
 */
export async function fetchLocalFalconReviewsAnalysisReport(
  apiKey: string,
  reportKey: string,
  fieldmask?: string
): Promise<any> {
  try {
    await rateLimiter.waitForAvailableSlot();
    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('report_key', reportKey);
    if (fieldmask) form.append('fieldmask', fieldmask);

    const response = await withRetry(async () => {
      return await fetchWithTimeout(
        `${API_BASE}/reviews/${reportKey}`,
        {
          method: 'POST',
          body: form,
        },
        DEFAULT_TIMEOUT_MS
      );
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Error fetching reviews analysis report:', error);
    throw error;
  }
}

/**
 * Searches the Local Falcon Knowledge Base for help articles, how-to guides, and platform documentation.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} [q] - Optional search query to filter articles
 * @param {string} [categoryId] - Optional category ID to filter articles
 * @param {string} [limit] - Optional limit for number of results
 * @param {string} [nextToken] - Optional pagination token for additional results
 * @returns {Promise<any>} API response with matching knowledge base articles
 */
export async function searchLocalFalconKnowledgeBase(
  apiKey: string,
  q?: string,
  categoryId?: string,
  limit?: string,
  nextToken?: string
): Promise<any> {
  const url = new URL(`${API_BASE_V2}/knowledge-base/`);
  url.searchParams.set("api_key", apiKey);

  if (q) url.searchParams.set("q", q);
  if (categoryId) url.searchParams.set("category_id", categoryId);
  if (limit) url.searchParams.set("limit", limit);
  if (nextToken) url.searchParams.set("next_token", nextToken);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Retrieves a specific Local Falcon Knowledge Base article by ID.
 * @param {string} apiKey - Your Local Falcon API key
 * @param {string} articleId - The numeric ID of the article to retrieve
 * @returns {Promise<any>} API response with the full article content
 */
export async function getLocalFalconKnowledgeBaseArticle(
  apiKey: string,
  articleId: string
): Promise<any> {
  const url = new URL(`${API_BASE_V2}/knowledge-base/${articleId}`);
  url.searchParams.set("api_key", apiKey);

  await rateLimiter.waitForAvailableSlot();

  return withRetry(async () => {
    const res = await fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: HEADERS,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Local Falcon API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    return await safeParseJson(res);
  });
}

/**
 * Fetches an image from a URL and returns it as base64-encoded data.
 * Used to convert image URLs in API responses to inline MCP image content.
 * @param {string} imageUrl - The image URL to fetch
 * @returns {Promise<{ data: string; mimeType: string } | null>} Base64 data and MIME type, or null on failure
 */
export async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetchWithTimeout(imageUrl, {}, 10000);
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || 'image/png';
    const arrayBuffer = await res.arrayBuffer();

    // Skip images larger than 5MB
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) return null;

    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return { data: base64, mimeType: contentType };
  } catch {
    return null;
  }
}