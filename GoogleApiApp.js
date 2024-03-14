/**
 * GitHub  https://github.com/tanaikech/GoogleApiApp<br>
 * Library name
 * @type {string}
 * @const {string}
 * @readonly
 */
var appName = "GoogleApiApp";

/**
 * ### Description
 * Set information of Google API you want to use.
 * 
 * @param {Object} object Object for using a Google API.
 * @return {GoogleApiApp}
 */
function setAPIInf(object = {}) {
  this.apiInf = object;
  return this;
}

/**
 * ### Description
 * Set parameters for using Google API you want to use. This object includes as follows.
 * `path`: Object Ex. fileId. This value is used in the endpoint.
 * `query`: Object Ex. fields. This value is used in the query parameter of the endpoint.
 * `requestBody`: Object Ex. {name: "sample title"}. This value is used as the request body of the API.
 * `usePageToken`: Boolean When this is true, the response value is retrieved with pageToken. Default value is false.
 * 
 * @param {Object} object Object including parameters for using a Google API.
 * @return {GoogleApiApp}
 */
function setAPIParams(object = {}) {
  this.apiParams = object;
  return this;
}

/**
 * ### Description
 * Set access token. When you are required to use the specific access token, please use this method. When the API key is not used, this access token is used. If the API key is not used and this methos is not used, the access token retrieved by `ScriptApp.getOAuthToken()` is used.
 * 
 * For example, if you want to use the access token retrieved from the service account. Please set the access token using this method.
 * 
 * @param {String} accessToken
 * @return {GoogleApiApp}
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
  const object = { apiInf: this.apiInf, apiParams: this.apiParams, accessToken: this.accessToken };
  return new GoogleApiApp_(object).getAPI();
}

/**
* ### Description
* Request Google API.
*
* @returns {UrlFetchApp.HTTPResponse|String[]} Response from API. When pageToken is used, String[] is returned.
*/
function request() {
  const object = { apiInf: this.apiInf, apiParams: this.apiParams, accessToken: this.accessToken };
  return new GoogleApiApp_(object).request();
}

/**
 * 
 */
class GoogleApiApp_ {

  /**
   * @param {Object} object Object using this library.
  */
  constructor(object) {
    this.obj = JSON.parse(JSON.stringify(object));
    this.discoveryUrl = "https://discovery.googleapis.com/discovery/v1/apis";
    this.apiUrl = "";
    this.token = "";
  }

  /**
  * ### Description
  * Get information of API.
  *
  * @returns {String[]} Returned information of API.
  */
  getAPI() {
    this.errorCheck_(false);
    this.getAPImethods_(this.obj);
    return this.obj.messages;
  }

  /**
  * ### Description
  * Request Google API.
  *
  * @returns {UrlFetchApp.HTTPResponse|String[]} Response from API. When pageToken is used, String[] is returned.
  */
  request() {
    this.errorCheck_(true);
    this.getAPImethods_(this.obj);
    if (this.obj.apiParams.hasOwnProperty("usePageToken") && this.obj.apiParams.usePageToken === true && this.obj.apiObj?.parameters?.pageToken) {
      return this.getList_(this.obj);
    }
    return this.normalRequest_(this.obj);
  }

  /**
  * ### Description
  * Check errors of inputted object.
  */
  errorCheck_(c) {
    const k = ["api", "version", "methodName"];
    if (!this.obj.apiInf || !k.every(e => this.obj.apiInf.hasOwnProperty(e))) {
      throw new Error("Invalid object. Please confirm it again.");
    }
    if (c) {
      if (!this.obj.apiParams) {
        this.obj.apiParams = { query: {} };
      } else if (this.obj.apiParams && !this.obj.apiParams.query) {
        this.obj.apiParams.query = {};
      }
      if (!this.obj.apiParams.query.hasOwnProperty("key")) {
        this.token = this.obj.accessToken || ScriptApp.getOAuthToken();
      }
    }
  }

  /**
  * ### Description
  * Get discovery rest URL.
  *
  * @param {Object} object { api, version } Name of API and version
  * @returns {Object} Discovery rest URL and information of API.
  */
  getAPI_({ api, version }) {
    const { items } = JSON.parse(this.fetch_({ url: `${this.discoveryUrl}?fields=*&name=${api}` }).getContentText())
    if (!items) {
      throw new Error("Invalid values are returned.");
    }
    const r = items.find(e => e.name == api.toLocaleLowerCase() && e.version == version);
    if (!r) {
      throw new Error("Inputted API was not found. Please confirm your inputted values again.");
    }
    const messages = [
      `Discovery rest URL is ${r.discoveryRestUrl}`,
      `Please enable ${r.title} ${r.version} at Advanced Google services or API console.`,
      `The link of official document is ${r.documentationLink}.`
    ];
    return { url: r.discoveryRestUrl, messages };
  }

  /**
  * ### Description
  * Get method of API.
  *
  * @param {Object} obj Object about the information of API.
  */
  getAPImethods_(obj) {
    const { apiInf: { api, version, methodName } } = obj
    const path = obj.apiParams?.path;
    const { url, messages } = this.getAPI_({ api, version });
    obj.url1 = url;
    obj.messages = messages;
    const { baseUrl, resources } = JSON.parse(this.fetch_({ url }).getContentText());
    const [resource, ...ar] = methodName.trim().split(".");
    let r = resources[resource];
    let out = null;
    for (let i = 0; i < ar.length; i++) {
      if (r.methods && r.methods.hasOwnProperty(ar[i])) {
        out = r.methods[ar[i]];
        break;
      } else if (r.resources && r.resources.hasOwnProperty(ar[i])) {
        r = r.resources[ar[i]];
      }
    }
    if (out === null) {
      throw new Error("Please set valid methodName. Ex. files.list, comments.list, users.settings.sendAs.smimeInfo.get and so on.");
    }
    obj.messages.push(
      `Please add one or several scopes from ${out.scopes.join(", ")}.`,
      out.description.trim()
    );
    this.apiUrl = `${baseUrl}${out.path}`;
    if (path) {
      Object.entries(path).forEach(([k, v]) => {
        const reg = new RegExp(`{.*${k}.*}`);
        this.apiUrl = this.apiUrl.replace(reg, v);
      });
    }
    obj.apiObj = out;
  }

  /**
  * ### Description
  * Request Google API.
  *
  * @param {Object} object Object for requesting API.
  * @returns {UrlFetchApp.HTTPResponse} Response from API.
  */
  normalRequest_(object) {
    const { apiParams, apiObj } = object;
    const url = this.addQuery(this.apiUrl, apiParams.query);
    const req = { url, muteHttpExceptions: true, method: apiObj.httpMethod };
    if (apiParams.requestBody && typeof apiParams.requestBody == "object") {
      req.payload = JSON.stringify(apiParams.requestBody);
      req.contentType = "application/json";
    }
    if (this.token) {
      req.headers = { authorization: "Bearer " + this.token };
    }
    const res = this.fetch_(req);
    if (res.getResponseCode() != 200) {
      console.log(object.messages.join("\n"));
      throw new Error(res.getContentText());
    }
    return res;
  }

  /**
  * ### Description
  * Request Google API with pageToken.
  *
  * @param {Object} object Object for requesting API.
  * @returns {String[]} Response from API using pageToken.
  */
  getList_(object) {
    let { apiParams, apiObj } = object;
    if (apiParams.query && apiParams.query.fields && !apiParams.query.fields.includes("nextPageToken")) {
      apiParams.query.fields += ",nextPageToken";
    }
    const p = ["maxResults", "pageSize"].find(e => apiObj.parameters[e]);
    if (apiObj.parameters[p]?.maximum && apiObj.parameters[p]?.maximum > 0) {
      apiParams.query[p] = apiObj.parameters[p].maximum;
    } else {
      console.log("The maximum 'pageSize' is not found. So, this request uses the default pageSize. If you know the maximum pageSize in this API, please include it in 'query'.");
    }
    let pageToken = "";
    const items = [];
    let numberOfPages = 1;
    do {
      console.log(`Page ${numberOfPages}`);
      const url = this.addQuery(this.apiUrl, apiParams.query);
      const req = { url, muteHttpExceptions: true, method: apiObj.httpMethod };
      if (this.token) {
        req.headers = { authorization: "Bearer " + this.token };
      }
      const res = this.fetch_(req);
      if (res.getResponseCode() != 200) {
        console.log(object.messages.join("\n"))
        throw new Error(res.getContentText());
      }
      const o = JSON.parse(res.getContentText());
      const ar = Object.values(o).find(e => typeof e == "object" && Array.isArray(e) && e.length > 0);
      if (ar && ar.length > 0) {
        items.push(...ar);
      }
      console.log(`Current number of list items ${items.length}`);
      pageToken = o.nextPageToken;
      apiParams.query.pageToken = pageToken;
      numberOfPages++;
    } while (pageToken);
    console.log(`Total number of pages is ${numberOfPages}.`);
    return items;
  }

  /**
  * ### Description
  * Add query parameter to the endpoint.
  * ref: https://github.com/tanaikech/UtlApp?tab=readme-ov-file#addqueryparameters
  *
  * @param {String} url Endpoint
  * @param {Object} query Query parameters.
  * @returns {String} Endpoint including the query parameters.
  */
  addQuery(url, query) {
    String.prototype.addQuery = function (o) {
      return (this == "" ? "" : `${this}?`) + Object.entries(o).flatMap(([k, v]) => Array.isArray(v) ? v.map(e => `${k}=${encodeURIComponent(e)}`) : `${k}=${encodeURIComponent(v)}`).join("&");
    }
    return url.addQuery(query);
  }

  /**
  * ### Description
  * Add query parameter to the endpoint.
  * ref: https://github.com/tanaikech/UtlApp?tab=readme-ov-file#addqueryparameters
  *
  * @param {Object} obj Object for using UrlFetchApp.fetchAll.
  * @returns {UrlFetchApp.HTTPResponse} Response from API.
  */
  fetch_(obj) {
    obj.muteHttpExceptions = true;
    const res = UrlFetchApp.fetchAll([obj])[0];
    if (res.getResponseCode() != 200) {
      throw new Error(res.getContentText());
    }
    return res;
  }
}
