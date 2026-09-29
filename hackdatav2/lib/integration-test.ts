// Integration test to verify frontend-backend connection
import { generateTabularRemote, generateRelationalRemote, healthCheck } from "./api";

async function runIntegrationTest() {
  console.log("Starting integration test...");
  console.log("API_URL:", process.env.NEXT_PUBLIC_API_URL);

  // Test 1: Health check
  console.log("\n1. Testing health endpoint...");
  try {
    const health = await healthCheck();
    console.log("✓ Health check:", health);
    if (health.status !== "ok") {
      throw new Error(`Health check failed: ${health.status}`);
    }
  } catch (error) {
    console.error("✗ Health check failed:", error);
    return false;
  }

  // Test 2: Tabular generation
  console.log("\n2. Testing tabular generation...");
  try {
    const tabularRequest = {
      spec: {
        tables: [{
          name: "users",
          row_count: 3,
          columns: [
            { name: "id", type: "integer", primary_key: true },
            { name: "username", type: "string" },
            { name: "email", type: "email" },
            { name: "age", type: "integer", min: 18, max: 65 }
          ]
        }]
      },
      seed: 12345,
      locale: "en_US",
      preview: true
    };

    const tabularResponse = await generateTabularRemote(tabularRequest);
    console.log("✓ Tabular generation successful:");
    console.log(`  - Generated ${Object.keys(tabularResponse.tables).length} table(s)`);
    console.log(`  - Rows per table:`, Object.values(tabularResponse.tables).map(t => t.length));
    if (tabularResponse.warnings?.length) {
      console.log(`  - Warnings: ${tabularResponse.warnings.length}`);
    }
  } catch (error) {
    console.error("✗ Tabular generation failed:", error);
    return false;
  }

  // Test 3: Relational generation
  console.log("\n3. Testing relational generation...");
  try {
    const relationalRequest = {
      spec: {
        tables: [
          {
            name: "departments",
            row_count: 2,
            columns: [
              { name: "id", type: "integer", primary_key: true },
              { name: "name", type: "string" },
              { name: "budget", type: "integer" }
            ]
          },
          {
            name: "employees",
            row_count: 5,
            columns: [
              { name: "id", type: "integer", primary_key: true },
              { name: "name", type: "string" },
              { name: "department_id", type: "integer" },
              { name: "salary", type: "integer" }
            ],
            foreign_keys: [
              {
                column: "department_id",
                ref_table: "departments",
                ref_column: "id"
              }
            ]
          }
        ]
      },
      seed: 54321,
      locale: "en_US",
      preview: true
    };

    const relationalResponse = await generateRelationalRemote(relationalRequest);
    console.log("✓ Relational generation successful:");
    console.log(`  - Generated ${Object.keys(relationalResponse.tables).length} table(s)`);
    console.log(`  - Rows per table:`, Object.entries(relationalResponse.tables).map(([name, rows]) => `${name}: ${rows.length}`).join(", "));
    if (relationalResponse.warnings?.length) {
      console.log(`  - Warnings: ${relationalResponse.warnings.length}`);
    }
  } catch (error) {
    console.error("✗ Relational generation failed:", error);
    return false;
  }

  console.log("\n✅ All integration tests passed!");
  return true;
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error("✗ Integration test failed with error:", error);
      process.exit(1);
    });
}

export { runIntegrationTest };