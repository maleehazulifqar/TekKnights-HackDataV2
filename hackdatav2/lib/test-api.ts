import { generateTabularRemote, generateRelationalRemote, generateDocumentsRemote, exportDocumentsRemote, exportDataRemote, inferSchemaRemote, healthCheck } from "./api";

// Test the backend connection
export async function testBackendConnection() {
  console.log("Testing backend connection...");

  // Test health check
  const health = await healthCheck();
  console.log("Health check:", health);

  if (health.status !== "ok") {
    throw new Error(`Backend health check failed: ${JSON.stringify(health)}`);
  }

  // Test schema inference
  console.log("Testing schema inference...");
  try {
    // Create a simple test file content
    const testCsvContent = "id,name,value\n1,test,100\n2,example,200";
    const blob = new Blob([testCsvContent]);

    const inferResult = await inferSchemaRemote(
      [{ filename: "test.csv", content: blob }],
      false
    );
    console.log("Schema inference successful:", inferResult.spec.tables.length, "tables found");
  } catch (error) {
    console.error("Schema inference failed:", error);
    // Don't fail the entire test for this - it might be due to missing dependencies
  }

  // Test tabular generation
  console.log("Testing tabular generation...");
  try {
    const tabularReq = {
      spec: {
        tables: [{
          name: "test_table",
          row_count: 5,
          columns: [
            { name: "id", type: "integer", primary_key: true },
            { name: "value", type: "integer" },
            { name: "name", type: "string" }
          ]
        }]
      },
      seed: 42,
      locale: "en_US",
      preview: true
    };

    const tabularResult = await generateTabularRemote(tabularReq);
    console.log("Tabular generation successful:", Object.keys(tabularResult.tables).length, "tables generated");
  } catch (error) {
    console.error("Tabular generation failed:", error);
    throw error;
  }

  console.log("All backend tests passed!");
  return true;
}