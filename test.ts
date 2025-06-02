import { fetchLocalFalconReports } from "./localfalcon.js";
// Use dotenv
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // if you want to use .env.local

// Replace with your actual Local Falcon API key
const API_KEY = process.env.LOCALFALCON_API_KEY || "<YOUR_API_KEY>";

async function main() {
  try {
    const result = await fetchLocalFalconReports(API_KEY, "3");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error fetching reports:", error);
  }
}

main();
