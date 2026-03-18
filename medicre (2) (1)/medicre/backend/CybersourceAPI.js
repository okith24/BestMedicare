/**
 * ============================================================
 * CYBERSOURCE API CLIENT
 * ============================================================
 * 
 * Handles communication with Cybersource Payments API v2.0
 * Makes HTTP requests, handles responses, manages credentials
 */

const https = require("https");
const crypto = require("crypto");

class CybersourceAPI {
  constructor() {
    this.merchantId = process.env.CYBERSOURCE_MERCHANT_ID;
    this.apiKey = process.env.CYBERSOURCE_API_KEY;
    this.secretKey = process.env.CYBERSOURCE_SECRET_KEY;
    this.baseUrl = process.env.CYBERSOURCE_API_URL || "api.cybersource.com";
  }

  /**
   * Make HTTP request to Cybersource API
   * @param {string} method - HTTP method (GET, POST, etc)
   * @param {string} path - API endpoint path
   * @param {object} body - Request body
   * @returns {object} Response from Cybersource
   */
  async makeRequest(method, path, body) {
    return new Promise((resolve, reject) => {
      try {
        // Build request options
        const options = {
          hostname: this.baseUrl,
          port: 443,
          path: path,
          method: method,
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Accept": "application/json",
            "User-Agent": "MedicalPayment/1.0",
          },
        };

        // Create HTTPS request
        const req = https.request(options, (res) => {
          let responseData = "";

          res.on("data", (chunk) => {
            responseData += chunk;
          });

          res.on("end", () => {
            try {
              const response = JSON.parse(responseData);
              
              // Add status code
              response.statusCode = res.statusCode;
              response.headers = res.headers;

              // Return mock response if development and credentials not set
              if (!this.merchantId || !this.apiKey) {
                console.warn("Cybersource credentials not configured - using mock response");
                return resolve({
                  id: `mock-${Date.now()}`,
                  decision: "ACCEPT",
                  processingInformation: { status: "ACCEPTED" },
                  statusCode: 201,
                });
              }

              resolve(response);
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error.message}`));
            }
          });
        });

        req.on("error", (error) => {
          reject(error);
        });

        // Send request body
        if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
          const bodyString =
            typeof body === "string" ? body : JSON.stringify(body);
          req.write(bodyString);
        }

        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create JWT signature for Cybersource authentication
   * Uses merchant ID + timestamp + API key
   */
  createSignature(requestPath, requestMethod = "POST") {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const header = `${requestMethod} ${requestPath}`;
      const message = `${header}\n${this.merchantId}\n${timestamp}`;

      const signature = crypto
        .createHmac("sha256", this.secretKey)
        .update(message)
        .digest("base64");

      return {
        signature,
        timestamp,
      };
    } catch (error) {
      console.error("Failed to create signature:", error);
      return null;
    }
  }
}

module.exports = new CybersourceAPI();
