/**
 * Test script for GoogleApiApp demonstrating the independent handling
 * of path parameters (no URL encoding) and query parameters (URL encoded).
 *
 * Features tested:
 * 1. File creation (POST)
 * 2. File retrieval using Path AND Query parameters simultaneously (GET)
 * 3. Safe cleanup of created resources (DELETE)
 */
function runGoogleApiAppPathAndQueryTest() {
  // Uncomment below to explicitly detect scopes if running outside of a GCP configured project
  // DriveApp.createFile('dummy', 'dummy');

  const liveLogger = (logMsg) => {
    console.log(`📡 [TEST LOG] ${logMsg}`);
  };

  let testFileId = null;
  const app = GoogleApiApp; // or new GAApp();

  try {
    console.log("======================================================");
    console.log("=== STEP 1: Create a temporary file ==================");
    console.log("======================================================");

    const createResponse = app
      .setAPIInf({
        api: "drive",
        version: "v3",
        methodName: "files.create",
      })
      .setAPIParams({
        requestBody: {
          name: "GoogleApiApp_PathQuery_Test.txt",
          mimeType: "text/plain",
        },
      })
      .request(liveLogger);

    const createdData = JSON.parse(createResponse.getContentText());
    testFileId = createdData.id;
    console.log(`\n✅ File created. ID: ${testFileId}\n`);

    console.log("======================================================");
    console.log("=== STEP 2: Test Path & Query Parameters =============");
    console.log("======================================================");

    // This request proves two mechanisms:
    // 1. `path` parameter (fileId): Replaces `{fileId}` in the endpoint directly WITHOUT encoding.
    // 2. `query` parameter (fields): URL encodes the string and appends as `?fields=id%2Cname%2CmimeType`.
    const getResponse = app
      .setAPIInf({
        api: "drive",
        version: "v3",
        methodName: "files.get",
      })
      .setAPIParams({
        path: { fileId: testFileId },
        query: { fields: "id,name,mimeType" },
      })
      .request(liveLogger);

    const fetchedData = JSON.parse(getResponse.getContentText());
    console.log(`\nReturned JSON Payload: ${JSON.stringify(fetchedData)}`);

    if (
      fetchedData.id === testFileId &&
      fetchedData.name === "GoogleApiApp_PathQuery_Test.txt"
    ) {
      console.log(
        `✅ TEST PASSED: Path parameter substitution and Query parameter encoding executed correctly.\n`,
      );
    } else {
      throw new Error(
        "Validation Failed: API did not return the expected object data.",
      );
    }
  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}\n`);
  } finally {
    if (testFileId) {
      console.log("======================================================");
      console.log("=== STEP 3: Cleanup - Deleting temporary file ========");
      console.log("======================================================");
      try {
        app
          .setAPIInf({
            api: "drive",
            version: "v3",
            methodName: "files.delete",
          })
          .setAPIParams({
            path: { fileId: testFileId },
          })
          .request(liveLogger);

        console.log(
          `\n✅ CLEANUP COMPLETE: File ${testFileId} deleted successfully.`,
        );
      } catch (cleanupError) {
        console.error(`\n❌ CLEANUP FAILED: ${cleanupError.message}`);
      }
    }
  }
}
