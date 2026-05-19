/**
 * GitHub  https://github.com/tanaikech/GoogleApiApp<br>
 * Library name
 * @type {string}
 * @const {string}
 * @readonly
 */
var appName = "GoogleApiApp";

/**
 * Library version
 * @type {string}
 * @const {string}
 * @readonly
 */
var version = "v2.0.0";

/**
 * @class GoogleApiApp
 * @version 2.0.0
 * @description
 * A robust, highly efficient ES6 Class to simplify the usage of various Google APIs with Google Apps Script.
 * This class automatically handles Google API Discovery, endpoint construction, authentication, caching,
 * pagination, and provides real-time logging alongside user-friendly error handling.
 *
 * ### How to Use directly (Without Library Wrapper)
 * 1. Initialize the class: `const app = new GAApp();`
 * 2. Set the API configuration: `app.setAPIInf({ api: "drive", version: "v3", methodName: "files.list" });`
 * 3. Set the API parameters: `app.setAPIParams({ query: { pageSize: 10 }, usePageToken: true });`
 * 4. Request the API: `const response = app.request(log => console.log(log));`
 *
 * Note: Ensure that the corresponding API is enabled via "Advanced Google services" (the "Services" '+' button
 * in the left sidebar of the GAS editor) or the Google Cloud API console. Also, ensure the required OAuth
 * scopes are added to your `appsscript.json` manifest file.
 */
var GAApp = class GoogleApiApp {
  /**
   * ### Description
   * Constructor for GoogleApiApp. Initializes internal properties and caching mechanisms.
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

    // Internal cache to prevent redundant fetching of massive Discovery Documents
    this.discoveryCache = {};
  }

  /**
   * ### Description
   * Set information of the Google API you want to use.
   *
   * @param {Object} object Object for using a Google API. e.g. {api: "drive", version: "v3", methodName: "files.list"}
   * @return {GoogleApiApp} This instance for method chaining.
   */
  setAPIInf(object = {}) {
    this.apiInf = object;
    return this;
  }

  /**
   * ### Description
   * Set parameters for using the Google API you want to use.
   * `path`: Object (e.g. { fileId: "xxx" }). This value is used in the endpoint path.
   * `query`: Object (e.g. { fields: "id,name" }). This value is used in the query parameter of the endpoint.
   * `requestBody`: Object (e.g. { name: "sample title" }). This value is used as the JSON request body.
   * `usePageToken`: Boolean. When true, the response items are retrieved automatically across all pages. Default is false.
   *
   * @param {Object} object Object including parameters for using a Google API.
   * @return {GoogleApiApp} This instance for method chaining.
   */
  setAPIParams(object = {}) {
    this.apiParams = object;
    return this;
  }

  /**
   * ### Description
   * Set a custom access token. When you are required to use a specific access token (e.g., from a service account),
   * please use this method. If this method is not used, the script will automatically fallback to `ScriptApp.getOAuthToken()`.
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
   * @param {Function} [callback=null] Optional callback function to receive real-time execution logs (e.g., `msg => console.log(msg)`).
   * @returns {UrlFetchApp.HTTPResponse|String[]} Returns HTTPResponse for normal requests. When `usePageToken` is true, returns an aggregated Array of items.
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

    this.log_("Executing normal singular API request.", callback);
    return this.normalRequest_(callback);
  }

  /**
   * ### Description
   * Retrieve the internal execution logs generated during the API requests.
   * Useful for debugging or storing run histories after execution completes.
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
          "Error occurred inside the provided logging callback function:",
          e,
        );
      }
    }
  }

  /**
   * ### Description
   * Verify the structural integrity of the inputted object properties.
   *
   * @param {Boolean} isRequest Flag indicating if this is an actual request or just information retrieval.
   * @private
   */
  errorCheck_(isRequest) {
    const requiredKeys = ["api", "version", "methodName"];
    if (
      !this.apiInf ||
      !requiredKeys.every((k) => this.apiInf.hasOwnProperty(k))
    ) {
      throw new Error(
        "Invalid apiInf object. Please ensure 'api', 'version', and 'methodName' are properly provided via setAPIInf().",
      );
    }
    if (isRequest) {
      if (!this.apiParams) {
        this.apiParams = { query: {} };
      } else if (!this.apiParams.query) {
        this.apiParams.query = {};
      }
      if (!this.apiParams.query.hasOwnProperty("key")) {
        this.token = this.accessToken || ScriptApp.getOAuthToken();
      }
    }
  }

  /**
   * ### Description
   * Construct user-friendly error messages based on common Google API HTTP response codes and payloads.
   * Specifically handles 403 (Forbidden) and 401 (Unauthorized) to guide users towards enabling APIs or adding scopes.
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
          : "Unknown (Please check official documentation)";
        userFriendlyHelp =
          `\n\n[ACTION REQUIRED: MISSING SCOPES]\n` +
          `Your script does not have the necessary permissions to execute this method.\n` +
          `Please manually add one or more of the following scopes to your 'appsscript.json' manifest file:\n- ${requiredScopes}`;
      } else if (
        lowerErrMsg.includes("has not been used in project") ||
        lowerErrMsg.includes("is disabled") ||
        lowerErrMsg.includes("enable it by visiting")
      ) {
        userFriendlyHelp =
          `\n\n[ACTION REQUIRED: API DISABLED]\n` +
          `The requested API (${this.apiInf.api.toUpperCase()} API) is currently disabled.\n` +
          `EASIEST FIX: Go to the Apps Script editor, look at the left sidebar, click the '+' icon next to "Services" (Advanced Google Services), and add "${this.apiInf.api}".\n` +
          `This action automatically enables the API in your Google Cloud project. Alternatively, you can enable it manually in the GCP API Console.`;
      } else {
        userFriendlyHelp =
          `\n\n[ACTION REQUIRED: PERMISSION DENIED]\n` +
          `Please verify two things:\n` +
          `1. The API is enabled in "Services" on the left sidebar of the Apps Script editor.\n` +
          `2. Your OAuth token or Service Account has proper access rights to the requested resource.`;
      }
    }

    return `API Request Failed (HTTP ${code}): ${errMsg}${userFriendlyHelp}\n\n--- Raw API Response ---\n${responseText}\n-----------------------`;
  }

  /**
   * ### Description
   * Fetch the Discovery Rest URL for the specified Google API.
   *
   * @param {Function} callback Callback for real-time logging.
   * @returns {Object} Discovery rest URL and warning messages of the API.
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
        "Invalid values returned from Discovery API. The requested API might not exist or is unsupported.",
      );
    }

    const r = items.find(
      (e) => e.name === api.toLowerCase() && e.version === version,
    );
    if (!r) {
      throw new Error(
        `Inputted API (${api} ${version}) was not found. Please verify the API name and version.`,
      );
    }

    this.log_(`Discovery Document located: ${r.discoveryRestUrl}`, callback);
    const messages = [
      `Discovery rest URL is ${r.discoveryRestUrl}`,
      `[IMPORTANT] Please enable "${r.title} ${r.version}" via "Advanced Google services" (Services '+' icon in the editor sidebar) or the GCP API console.`,
      `Official documentation link: ${r.documentationLink}`,
    ];

    return { url: r.discoveryRestUrl, messages };
  }

  /**
   * ### Description
   * Extract the target method details from the API specification and construct the final endpoint.
   * Utilizes internal caching to drastically improve performance on sequential calls.
   *
   * @param {Function} callback Callback for logging.
   * @private
   */
  getAPImethods_(callback) {
    const { api, version, methodName } = this.apiInf;
    const cacheKey = `${api}_${version}`;
    let url, messages, baseUrl, resources;

    if (this.discoveryCache[cacheKey]) {
      this.log_(
        `Cache HIT: Using previously fetched Discovery Document for ${cacheKey}.`,
        callback,
      );
      ({ url, messages, baseUrl, resources } = this.discoveryCache[cacheKey]);
      this.messages = messages;
    } else {
      this.log_(
        `Cache MISS: Fetching specifications for ${cacheKey}.`,
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

      this.discoveryCache[cacheKey] = {
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

    if (!r) {
      throw new Error(
        `Resource '${resource}' not found in API specifications.`,
      );
    }

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
        `Method '${methodName}' is invalid. Please set a valid methodName (e.g., files.list, users.settings.sendAs.smimeInfo.get).`,
      );
    }

    if (out.scopes) {
      this.messages.push(
        `Required Scopes: Please add one or several of the following scopes to appsscript.json: \n- ${out.scopes.join("\n- ")}`,
        out.description ? `Description: ${out.description.trim()}` : "",
      );
    }

    this.apiUrl = `${baseUrl}${out.path}`;
    if (this.apiParams?.path) {
      Object.entries(this.apiParams.path).forEach(([k, v]) => {
        const reg = new RegExp(`{.*?${k}.*?}`);
        this.apiUrl = this.apiUrl.replace(reg, encodeURIComponent(v));
      });
    }

    this.log_(
      `Successfully constructed Base Endpoint URL: ${this.apiUrl}`,
      callback,
    );
    this.apiObj = out;
  }

  /**
   * ### Description
   * Execute a singular HTTP request to the Google API.
   *
   * @param {Function} callback Callback for logging.
   * @returns {UrlFetchApp.HTTPResponse} Raw response from API.
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
   * Execute sequential HTTP requests to the Google API, automatically aggregating items using pageToken.
   *
   * @param {Function} callback Callback for logging.
   * @returns {String[]} Consolidated array of response items.
   * @private
   */
  getList_(callback) {
    if (
      this.apiParams.query &&
      this.apiParams.query.fields &&
      !this.apiParams.query.fields.includes("nextPageToken")
    ) {
      this.apiParams.query.fields += ",nextPageToken";
      this.log_(
        "Appended 'nextPageToken' to query.fields to ensure pagination functionality works.",
        callback,
      );
    }

    const p = ["maxResults", "pageSize"].find((e) => this.apiObj.parameters[e]);
    if (
      p &&
      this.apiObj.parameters[p]?.maximum &&
      this.apiObj.parameters[p]?.maximum > 0
    ) {
      this.apiParams.query[p] = this.apiObj.parameters[p].maximum;
      this.log_(
        `Maximized pagination efficiency by forcing query '${p}' = ${this.apiObj.parameters[p].maximum}`,
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

      if (this.token) {
        req.headers = { authorization: `Bearer ${this.token}` };
      }

      const res = this.fetch_({ url, ...req }, callback);
      const code = res.getResponseCode();

      if (code < 200 || code >= 300) {
        const userFriendlyErrorMsg = this.handleApiError_(
          code,
          res.getContentText(),
        );
        this.log_(
          `API Execution Failed on Page ${numberOfPages}. Parsing error details...`,
          callback,
        );
        throw new Error(userFriendlyErrorMsg);
      }

      const o = JSON.parse(res.getContentText());
      // Identify the primary array holding items
      const ar = Object.values(o).find((e) => Array.isArray(e));

      if (ar && ar.length > 0) {
        items.push(...ar);
      }
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
      `Complete. Fetched ${numberOfPages} page(s) totaling ${items.length} aggregated items.`,
      callback,
    );
    return items;
  }

  /**
   * ### Description
   * Safely appends query parameters to the endpoint URL.
   *
   * @param {String} url Endpoint URL string.
   * @param {Object} query Query parameters object.
   * @returns {String} Endpoint string containing properly encoded query parameters.
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
   * Secure wrapper for UrlFetchApp.fetch. Extracted for real-time logging and mockability.
   *
   * @param {Object} obj Request configuration object including url.
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

// -------------------------------------------------------------------------
// Global Wrapper Functions (For Backward Compatibility in GAS Library Mode)
// -------------------------------------------------------------------------

/**
 * Internal global instance to preserve discoveryCache and states across chaining
 * when used as a library.
 * @private
 */
const globalAppInstance_ = new GAApp();

/**
 * ### Description
 * Set information of Google API you want to use.
 * (Maintains strictly backward-compatible method chaining via `this`)
 *
 * @param {Object} object Object for using a Google API.
 * @return {Object} Returns global `this` for chaining.
 */
function setAPIInf(object = {}) {
  this.apiInf = object;
  return this;
}

/**
 * ### Description
 * Set parameters for using Google API you want to use.
 * (Maintains strictly backward-compatible method chaining via `this`)
 *
 * @param {Object} object Object including parameters for using a Google API.
 * @return {Object} Returns global `this` for chaining.
 */
function setAPIParams(object = {}) {
  this.apiParams = object;
  return this;
}

/**
 * ### Description
 * Set access token.
 * (Maintains strictly backward-compatible method chaining via `this`)
 *
 * @param {String} accessToken
 * @return {Object} Returns global `this` for chaining.
 */
function setAccessToken(accessToken) {
  this.accessToken = accessToken;
  return this;
}

/**
 * ### Description
 * Get information of Google API.
 *
 * @returns {String[]} Returned information of API.
 */
function getAPI() {
  globalAppInstance_.setAPIInf(this.apiInf || {});
  globalAppInstance_.setAPIParams(this.apiParams || {});
  if (this.accessToken) globalAppInstance_.setAccessToken(this.accessToken);
  return globalAppInstance_.getAPI();
}

/**
 * ### Description
 * Request Google API.
 *
 * @param {Function} [callback=null] Optional callback function to receive real-time execution logs.
 * @returns {UrlFetchApp.HTTPResponse|String[]} Response from API. When pageToken is used, String[] is returned.
 */
function request(callback = null) {
  globalAppInstance_.setAPIInf(this.apiInf || {});
  globalAppInstance_.setAPIParams(this.apiParams || {});
  if (this.accessToken) globalAppInstance_.setAccessToken(this.accessToken);
  return globalAppInstance_.request(callback);
}

/**
 * ### Description
 * Retrieve the internal execution logs generated during the API requests.
 *
 * @returns {String[]} Array of timestamped log strings.
 */
function getLogs() {
  return globalAppInstance_.getLogs();
}
