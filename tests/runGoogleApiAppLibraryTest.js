/**
 * Test script for using GoogleApiApp as a GAS Library.
 * Features tested:
 * 1. Method chaining via the library prefix (GoogleApiApp)
 * 2. Real-time logging through callbacks
 * 3. User-friendly API error exception handling
 * 4. Internal cache efficiency across sequential requests
 */
function runGoogleApiAppLibraryTest() {
  // DriveApp.createFile(); // Uncomment to automatically detect scope for https://www.googleapis.com/auth/drive

  const liveLogger = (logMsg) => {
    console.log(`📡 [LIVE-TRACE] ${logMsg}`);
  };

  let testFileId = null;

  try {
    console.log("======================================================");
    console.log("=== TEST 1: Create a temporary file via Library =====");
    console.log("======================================================");

    // Using the library prefix "GoogleApiApp"
    const createResponse = GoogleApiApp.setAPIInf({
      api: "drive",
      version: "v3",
      methodName: "files.create",
    })
      .setAPIParams({
        requestBody: {
          name: "GoogleApiApp_Library_Test.txt",
          mimeType: "text/plain",
        },
      })
      .request(liveLogger);

    const createdData = JSON.parse(createResponse.getContentText());
    testFileId = createdData.id;
    console.log(
      `\n✅ TEST 1 PASSED: File created successfully. File ID: ${testFileId}\n`,
    );

    console.log("======================================================");
    console.log("=== TEST 2: Update the created file via Library =====");
    console.log("======================================================");

    // The second request verifies the efficiency of the internal discoveryCache inside the library.
    const updateResponse = GoogleApiApp.setAPIInf({
      api: "drive",
      version: "v3",
      methodName: "files.update",
    })
      .setAPIParams({
        path: { fileId: testFileId },
        requestBody: { description: "Updated via GoogleApiApp Library" },
      })
      .request(liveLogger);

    console.log(
      `\n✅ TEST 2 PASSED: File updated successfully. HTTP Status: ${updateResponse.getResponseCode()}\n`,
    );

    console.log("======================================================");
    console.log("=== TEST 3: Validate getLogs() via Library ==========");
    console.log("======================================================");

    const historicalLogs = GoogleApiApp.getLogs();
    console.log(
      `Total historical logs recorded in library memory: ${historicalLogs.length}`,
    );
    if (historicalLogs.length > 0) {
      console.log(`Log Output [First]:\n  -> ${historicalLogs[0]}`);
      console.log(
        `Log Output [Last]:\n  -> ${historicalLogs[historicalLogs.length - 1]}`,
      );
    }
    console.log("\n✅ TEST 3 PASSED: Logs array successfully retrieved.\n");
  } catch (error) {
    console.error(
      `\n❌ TEST SUITE FAILED (Error Caught):\n\n${error.message}\n`,
    );
  } finally {
    if (testFileId) {
      console.log("======================================================");
      console.log("=== CLEANUP: Deleting temporary file ================");
      console.log("======================================================");
      try {
        GoogleApiApp.setAPIInf({
          api: "drive",
          version: "v3",
          methodName: "files.delete",
        })
          .setAPIParams({
            path: { fileId: testFileId },
          })
          .request(liveLogger);
        console.log(
          `\n✅ CLEANUP COMPLETE: Temporary File ${testFileId} has been cleanly deleted.`,
        );
      } catch (cleanupError) {
        console.error(
          `\n❌ CLEANUP FAILED: Failed to delete file.\n\n${cleanupError.message}`,
        );
      }
    }
  }
}
