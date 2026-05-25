/**
 * GitHub  https://github.com/tanaikech/GoogleApiApp<br>
 * Library name
 * @type {string}
 * @const {string}
 * @readonly
 */
const appName = "GoogleApiApp";

/**
 * Library version
 * @type {string}
 * @const {string}
 * @readonly
 */
const version = "v2.2.0";

/**
 * @class GoogleApiApp
 * @version 2.2.0
 * @description
 * A robust, highly efficient ES6 Class to simplify the usage of various Google APIs with Google Apps Script.
 * This class automatically handles Google API Discovery, endpoint construction, authentication, caching,
 * pagination, and provides real-time logging alongside user-friendly error handling.
 *
 * ### Key Updates in v2.2.0:
 * - Implemented strict RFC 6570 compliant URL encoding for path parameters. Distinguishes between standard
 *   expansions (`{param}`, uses encodeURIComponent) and reserved expansions (`{+param}`, uses encodeURI).
 * - Eliminates routing vulnerabilities when passing multi-byte text (e.g., Japanese sheet names) into path parameters.
 *
 * ### How to Use directly (Without Library Wrapper)
 * 1. Initialize the class: `const app = new GAApp();`
 * 2. Set the API configuration: `app.setAPIInf({ api: "analyticsdata", version: "v1beta", methodName: "properties.runReport" });`
 * 3. Set the API parameters: `app.setAPIParams({ path: { property: "properties/12345" }, query: { fields: "kind" } });`
 * 4. Request the API: `const response = app.request(log => console.log(log));`
 */
const GAApp = class GoogleApiApp {
  /**
   * ### Description
   * Constructor for GoogleApiApp. Initializes internal properties.
   */
  constructor() {
    this.apiInf = {};
    this.apiParams = {};
    this.accessToken = "";
    this.discoveryUrl = "https://discovery.googleapis.com/discovery/v1/apis";
    this.apiUrl = "";
    this.token = "";
    this.messages = [];
    this.apiObj = null;
    this.logs = [];
  }

  /**
   * ### Description
   * Set information of the Google API you want to use.
   *
   * @param {Object} object Configuration object. e.g. {api: "drive", version: "v3", methodName: "files.list"}
   * @return {GoogleApiApp} This instance for method chaining.
   */
  setAPIInf(object = {}) {
    this.apiInf = object;
    return this;
  }

  /**
   * ### Description
   * Set parameters for using the Google API.
   * `path`: Object (e.g. { property: "properties/123" }). Strictly encoded per RFC 6570 specifications.
   * `query`: Object (e.g. { fields: "id,name" }). Safely URL-encoded and appended as query strings.
   * `requestBody`: Object (e.g. { name: "sample title" }). Sent as the JSON request body.
   * `usePageToken`: Boolean. When true, retrieves all items automatically across pages.
   *
   * @param {Object} object Object containing API arguments.
   * @return {GoogleApiApp} This instance for method chaining.
   */
  setAPIParams(object = {}) {
    this.apiParams = object;
    return this;
  }

  /**
   * ### Description
   * Set a custom access token. Overrides `ScriptApp.getOAuthToken()`.
   *
   * @param {String} accessToken Your custom OAuth2 access token.
   * @return {GoogleApiApp} This instance for method chaining.
   */
  setAccessToken(accessToken) {
    this.accessToken = accessToken;
    return this;
  }

  /**
   * ### Description
   * Get parsed information and requirements of the configured Google API.
   *
   * @returns {String[]} Array of strings detailing the API discovery URL, required scopes, and documentation links.
   */
  getAPI() {
    this.errorCheck_(false);
    this.getAPImethods_(null);
    return this.messages;
  }

  /**
   * ### Description
   * Execute the requested Google API call.
   *
   * @param {Function} [callback=null] Optional callback function to receive real-time execution logs.
   * @returns {UrlFetchApp.HTTPResponse|String[]} Returns HTTPResponse for normal requests. Returns an Array of items if `usePageToken` is true.
   */
  request(callback = null) {
    this.log_("Starting API request process...", callback);
    this.errorCheck_(true);
    this.getAPImethods_(callback);

    if (
      this.apiParams?.usePageToken === true &&
      this.apiObj?.parameters?.pageToken
    ) {
      this.log_(
        "Pagination mode (usePageToken) is active. Starting automatic list retrieval.",
        callback,
      );
      return this.getList_(callback);
    }

    this.log_("Executing standard singular API request.", callback);
    return this.normalRequest_(callback);
  }

  /**
   * ### Description
   * Retrieve internal execution logs generated during the API requests.
   *
   * @returns {String[]} Array of timestamped log strings.
   */
  getLogs() {
    return this.logs;
  }

  /**
   * ### Description
   * Internal method to record logs and invoke the callback if provided.
   *
   * @param {String} message The log message.
   * @param {Function} callback The callback function.
   * @private
   */
  log_(message, callback) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logs.push(logEntry);
    if (typeof callback === "function") {
      try {
        callback(logEntry);
      } catch (e) {
        console.error(
          "Error inside the provided logging callback function:",
          e,
        );
      }
    }
  }

  /**
   * ### Description
   * Verify structural integrity of the input parameters.
   *
   * @param {Boolean} isRequest Flag indicating if this is an actual request.
   * @private
   */
  errorCheck_(isRequest) {
    const requiredKeys = ["api", "version", "methodName"];
    if (
      !this.apiInf ||
      !requiredKeys.every((k) => this.apiInf.hasOwnProperty(k))
    ) {
      throw new Error(
        "Invalid apiInf object. Ensure 'api', 'version', and 'methodName' are properly provided via setAPIInf().",
      );
    }

    if (isRequest) {
      this.apiParams = this.apiParams || {};
      this.apiParams.query = this.apiParams.query || {};
      if (!this.apiParams.query.hasOwnProperty("key")) {
        this.token = this.accessToken || ScriptApp.getOAuthToken();
      }
    }
  }

  /**
   * ### Description
   * Construct actionable error messages based on API HTTP response codes.
   *
   * @param {Number} code HTTP Status Code.
   * @param {String} responseText Raw JSON string response from the API.
   * @returns {String} A formatted, actionable error message.
   * @private
   */
  handleApiError_(code, responseText) {
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      parsed = { error: { message: responseText } };
    }

    const errMsg = parsed.error?.message || responseText;
    let userFriendlyHelp = "";

    if (code === 403 || code === 401) {
      const lowerErrMsg = errMsg.toLowerCase();
      if (
        lowerErrMsg.includes("insufficient authentication scopes") ||
        lowerErrMsg.includes("insufficient permission")
      ) {
        const requiredScopes = this.apiObj?.scopes
          ? this.apiObj.scopes.join("\n- ")
          : "Unknown (Check official documentation)";
        userFriendlyHelp = `\n\n[ACTION REQUIRED: MISSING SCOPES]\nManually add these scopes to your 'appsscript.json' manifest:\n- ${requiredScopes}`;
      } else if (
        lowerErrMsg.includes("has not been used in project") ||
        lowerErrMsg.includes("is disabled")
      ) {
        userFriendlyHelp = `\n\n[ACTION REQUIRED: API DISABLED]\nThe requested API (${this.apiInf.api.toUpperCase()}) is disabled.\nEnable it via "Advanced Google Services" (the '+' icon in the editor sidebar).`;
      } else {
        userFriendlyHelp = `\n\n[ACTION REQUIRED: PERMISSION DENIED]\nVerify the API is enabled in Services and your OAuth token possesses the correct access rights.`;
      }
    }

    return `API Request Failed (HTTP ${code}): ${errMsg}${userFriendlyHelp}\n\n--- Raw API Response ---\n${responseText}\n-----------------------`;
  }

  /**
   * ### Description
   * Fetch the Discovery Rest URL for the specified Google API.
   *
   * @param {Function} callback Callback for real-time logging.
   * @returns {Object} Discovery rest URL and API warning messages.
   * @private
   */
  getAPI_(callback) {
    const { api, version } = this.apiInf;
    this.log_(`Fetching Discovery Document list for API: ${api}`, callback);

    const targetUrl = `${this.discoveryUrl}?fields=items(name,version,discoveryRestUrl,title,documentationLink)&name=${api.toLowerCase()}`;
    const res = this.fetch_({ url: targetUrl }, callback);

    if (res.getResponseCode() !== 200) {
      throw new Error(`Discovery API Fetch Error: ${res.getContentText()}`);
    }

    const { items } = JSON.parse(res.getContentText());
    if (!items || items.length === 0) {
      throw new Error(
        "Invalid response from Discovery API. Requested API may not exist.",
      );
    }

    const r = items.find(
      (e) => e.name === api.toLowerCase() && e.version === version,
    );
    if (!r) {
      throw new Error(
        `API (${api} ${version}) not found. Verify the API name and version.`,
      );
    }

    this.log_(`Discovery Document located: ${r.discoveryRestUrl}`, callback);
    return {
      url: r.discoveryRestUrl,
      messages: [
        `Discovery rest URL is ${r.discoveryRestUrl}`,
        `[IMPORTANT] Enable "${r.title} ${r.version}" via "Advanced Google services".`,
        `Official documentation link: ${r.documentationLink}`,
      ],
    };
  }

  /**
   * ### Description
   * Extract target method details and construct the final endpoint.
   * Applies rigorous RFC 6570 encoding. `{+param}` allows reserved characters, `{param}` restricts them.
   *
   * @param {Function} callback Callback for logging.
   * @private
   */
  getAPImethods_(callback) {
    const { api, version, methodName } = this.apiInf;
    const cacheKey = `${api}_${version}`;
    let url, messages, baseUrl, resources;

    // Utilizing static class cache to preserve data across multiple instances
    if (GAApp.discoveryCache[cacheKey]) {
      this.log_(
        `Static Cache HIT: Using fetched Discovery Document for ${cacheKey}.`,
        callback,
      );
      ({ url, messages, baseUrl, resources } = GAApp.discoveryCache[cacheKey]);
      this.messages = messages;
    } else {
      this.log_(
        `Static Cache MISS: Fetching specifications for ${cacheKey}.`,
        callback,
      );
      const discoveryData = this.getAPI_(callback);
      url = discoveryData.url;
      this.messages = discoveryData.messages;

      this.log_(`Fetching extensive API resource JSON from: ${url}`, callback);
      const res = this.fetch_({ url }, callback);
      if (res.getResponseCode() !== 200) {
        throw new Error(
          `Failed to fetch Discovery Document resources: ${res.getContentText()}`,
        );
      }

      const parsed = JSON.parse(res.getContentText());
      baseUrl = parsed.baseUrl;
      resources = parsed.resources;

      GAApp.discoveryCache[cacheKey] = {
        url,
        messages: this.messages,
        baseUrl,
        resources,
      };
    }

    this.log_(`Parsing method hierarchy for: ${methodName}`, callback);
    const [resource, ...ar] = methodName.trim().split(".");
    let r = resources[resource];
    let out = null;

    if (!r)
      throw new Error(
        `Resource '${resource}' not found in API specifications.`,
      );

    for (let i = 0; i < ar.length; i++) {
      if (r.methods && r.methods[ar[i]]) {
        out = r.methods[ar[i]];
        break;
      } else if (r.resources && r.resources[ar[i]]) {
        r = r.resources[ar[i]];
      } else {
        break;
      }
    }

    if (out === null) {
      throw new Error(
        `Method '${methodName}' is invalid. (e.g., files.list, properties.runReport)`,
      );
    }

    if (out.scopes) {
      this.messages.push(
        `Required Scopes: Add to appsscript.json: \n- ${out.scopes.join("\n- ")}`,
        out.description ? `Description: ${out.description.trim()}` : "",
      );
    }

    this.apiUrl = `${baseUrl}${out.path}`;

    // Inject Path Parameters with RFC 6570 compliant URL Encoding
    if (this.apiParams?.path) {
      Object.entries(this.apiParams.path).forEach(([k, v]) => {
        const isReservedExpansion = this.apiUrl.includes(`{+${k}}`);
        const reg = new RegExp(`{\\+?${k}}`, "g");

        // encodeURI preserves reserved characters like '/', while encodeURIComponent escapes them.
        const safeValue = isReservedExpansion
          ? encodeURI(v)
          : encodeURIComponent(v);
        this.apiUrl = this.apiUrl.replace(reg, safeValue);
      });
    }

    this.log_(`Constructed Base Endpoint URL: ${this.apiUrl}`, callback);
    this.apiObj = out;
  }

  /**
   * ### Description
   * Execute a singular HTTP request.
   *
   * @param {Function} callback Callback for logging.
   * @returns {UrlFetchApp.HTTPResponse}
   * @private
   */
  normalRequest_(callback) {
    const url = this.addQuery_(this.apiUrl, this.apiParams.query);
    const req = { muteHttpExceptions: true, method: this.apiObj.httpMethod };

    if (
      this.apiParams.requestBody &&
      typeof this.apiParams.requestBody === "object"
    ) {
      req.payload = JSON.stringify(this.apiParams.requestBody);
      req.contentType = "application/json";
      this.log_("Attached requestBody (JSON payload).", callback);
    }

    if (this.token) {
      req.headers = { authorization: `Bearer ${this.token}` };
    }

    this.log_(`Sending [${req.method}] request to: ${url}`, callback);
    const res = this.fetch_({ url, ...req }, callback);
    const code = res.getResponseCode();

    this.log_(`Received HTTP Response Code: ${code}`, callback);

    if (code < 200 || code >= 300) {
      const userFriendlyErrorMsg = this.handleApiError_(
        code,
        res.getContentText(),
      );
      this.log_(`API Execution Failed. Parsing error details...`, callback);
      throw new Error(userFriendlyErrorMsg);
    }

    this.log_("Request executed successfully.", callback);
    return res;
  }

  /**
   * ### Description
   * Execute sequential HTTP requests, aggregating items automatically via pageToken.
   *
   * @param {Function} callback Callback for logging.
   * @returns {String[]} Consolidated array of items.
   * @private
   */
  getList_(callback) {
    if (
      this.apiParams.query?.fields &&
      !this.apiParams.query.fields.includes("nextPageToken")
    ) {
      this.apiParams.query.fields += ",nextPageToken";
      this.log_(
        "Appended 'nextPageToken' to query.fields to ensure pagination functionality.",
        callback,
      );
    }

    const p = ["maxResults", "pageSize"].find((e) => this.apiObj.parameters[e]);
    if (p && this.apiObj.parameters[p]?.maximum > 0) {
      this.apiParams.query[p] = this.apiObj.parameters[p].maximum;
      this.log_(
        `Forced query '${p}' = ${this.apiObj.parameters[p].maximum} to maximize pagination efficiency.`,
        callback,
      );
    }

    let pageToken = "";
    const items = [];
    let numberOfPages = 1;

    do {
      this.log_(
        `--- Processing Pagination Sequence: Page ${numberOfPages} ---`,
        callback,
      );
      const url = this.addQuery_(this.apiUrl, this.apiParams.query);
      const req = { muteHttpExceptions: true, method: this.apiObj.httpMethod };

      if (this.token) req.headers = { authorization: `Bearer ${this.token}` };

      const res = this.fetch_({ url, ...req }, callback);
      const code = res.getResponseCode();

      if (code < 200 || code >= 300) {
        const errorMsg = this.handleApiError_(code, res.getContentText());
        this.log_(`Execution Failed on Page ${numberOfPages}.`, callback);
        throw new Error(errorMsg);
      }

      const o = JSON.parse(res.getContentText());
      const ar = Object.values(o).find((e) => Array.isArray(e));

      if (ar && ar.length > 0) items.push(...ar);
      this.log_(
        `Successfully fetched items. Cumulative array size: ${items.length}`,
        callback,
      );

      pageToken = o.nextPageToken;
      if (pageToken) {
        this.apiParams.query.pageToken = pageToken;
        this.log_(
          `Next page token identified. Scheduling fetch for Page ${numberOfPages + 1}.`,
          callback,
        );
        numberOfPages++;
      }
    } while (pageToken);

    this.log_(
      `Complete. Fetched ${numberOfPages} page(s) totaling ${items.length} items.`,
      callback,
    );
    return items;
  }

  /**
   * ### Description
   * Safely appends query parameters to the endpoint URL.
   * Query parameters are strictly URL-encoded.
   *
   * @param {String} url Endpoint URL string.
   * @param {Object} query Query parameters object.
   * @returns {String} URL containing encoded query strings.
   * @private
   */
  addQuery_(url, query) {
    if (!query || Object.keys(query).length === 0) return url;
    const qs = Object.entries(query)
      .flatMap(([k, v]) =>
        Array.isArray(v)
          ? v.map((e) => `${k}=${encodeURIComponent(e)}`)
          : `${k}=${encodeURIComponent(v)}`,
      )
      .join("&");
    return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
  }

  /**
   * ### Description
   * Secure wrapper for UrlFetchApp.fetch.
   *
   * @param {Object} obj Request configuration object.
   * @param {Function} callback Callback for logging.
   * @returns {UrlFetchApp.HTTPResponse}
   * @private
   */
  fetch_(obj, callback) {
    const { url, ...options } = obj;
    options.muteHttpExceptions = true;
    this.log_(`[UrlFetchApp] Executing remote fetch to: ${url}`, callback);
    return UrlFetchApp.fetch(url, options);
  }
};

// V8 Compatible Static Class Property Assignment
GAApp.discoveryCache = {};

// -------------------------------------------------------------------------
// Global Wrapper Functions (For Backward Compatibility in GAS Library Mode)
// -------------------------------------------------------------------------

const globalAppInstance_ = new GAApp();

function setAPIInf(object = {}) {
  this.apiInf = object;
  return this;
}

function setAPIParams(object = {}) {
  this.apiParams = object;
  return this;
}

function setAccessToken(accessToken) {
  this.accessToken = accessToken;
  return this;
}

function getAPI() {
  globalAppInstance_.setAPIInf(this.apiInf || {});
  globalAppInstance_.setAPIParams(this.apiParams || {});
  if (this.accessToken) globalAppInstance_.setAccessToken(this.accessToken);
  return globalAppInstance_.getAPI();
}

function request(callback = null) {
  globalAppInstance_.setAPIInf(this.apiInf || {});
  globalAppInstance_.setAPIParams(this.apiParams || {});
  if (this.accessToken) globalAppInstance_.setAccessToken(this.accessToken);
  return globalAppInstance_.request(callback);
}

function getLogs() {
  return globalAppInstance_.getLogs();
}

// For directly using this
// const GoogleApiApp = { setAPIInf, setAPIParams, request, getAPI, setAccessToken, getLogs };
