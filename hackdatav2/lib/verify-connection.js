// Simple verification script to check frontend-backend connection
const API_URL = "http://127.0.0.1:8000";

async function verifyConnection() {
  console.log("Verifying frontend-backend connection...");
  console.log("API URL:", API_URL);

  try {
    // Test health endpoint
    console.log("\n1. Testing health endpoint...");
    const healthResponse = await fetch(`${API_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Health check failed with status ${healthResponse.status}`);
    }
    const healthData = await healthResponse.json();
    console.log("✓ Health check passed:", healthData);

    // Test tabular generation endpoint
    console.log("\n2. Testing tabular generation endpoint...");
    const tabularResponse = await fetch(`${API_URL}/generate/tabular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec: {
          tables: [{
            name: "test_table",
            row_count: 2,
            columns: [
              { name: "id", type: "integer", primary_key: true },
              { name: "value", type: "integer" }
            ]
          }]
        },
        seed: 999,
        locale: "en_US",
        preview: true
      })
    });

    if (!tabularResponse.ok) {
      throw new Error(`Tabular generation failed with status ${tabularResponse.status}`);
    }
    const tabularData = await tabularResponse.json();
    console.log("✓ Tabular generation passed:");
    console.log(`  - Generated ${Object.keys(tabularData.tables).length} table(s)`);
    console.log(`  - Table "test_table" has ${tabularData.tables.test_table.length} rows`);

    // Test relational generation endpoint
    console.log("\n3. Testing relational generation endpoint...");
    const relationalResponse = await fetch(`${API_URL}/generate/relational`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec: {
          tables: [
            {
              name: "authors",
              row_count: 2,
              columns: [
                { name: "id", type: "integer", primary_key: true },
                { name: "name", type: "string" }
              ]
            },
            {
              name: "books",
              row_count: 3,
              columns: [
                { name: "id", type: "integer", primary_key: true },
                { name: "title", type: "string" },
                { name: "author_id", type: "integer" }
              ],
              foreign_keys: [
                {
                  column: "author_id",
                  ref_table: "authors",
                  ref_column: "id"
                }
              ]
            }
          ]
        },
        seed: 888,
        locale: "en_US",
        preview: true
      })
    });

    if (!relationalResponse.ok) {
      throw new Error(`Relational generation failed with status ${relationalResponse.status}`);
    }
    const relationalData = await relationalResponse.json();
    console.log("✓ Relational generation passed:");
    console.log(`  - Generated ${Object.keys(relationalData.tables).length} table(s)`);
    console.log(`  - Authors: ${relationalData.tables.authors.length} rows`);
    console.log(`  - Books: ${relationalData.tables.books.length} rows`);

    console.log("\n🎉 All verification tests passed! Frontend can successfully connect to backend.");
    return true;

  } catch (error) {
    console.error("\n❌ Verification failed:", error.message);
    return false;
  }
}

// Run the verification
verifyConnection()
  .then(success => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error("❌ Verification failed with error:", error);
    process.exit(1);
  });