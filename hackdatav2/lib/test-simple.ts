// Simple test to verify API configuration
console.log("NEXT_PUBLIC_API_URL:", process.env.NEXT_PUBLIC_API_URL);

// Test if we can reach the backend
async function testConnection() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`);
    if (response.ok) {
      const data = await response.json();
      console.log("Backend connection successful:", data);
      return true;
    } else {
      console.error("Backend returned error status:", response.status);
      return false;
    }
  } catch (error) {
    console.error("Failed to connect to backend:", error);
    return false;
  }
}

// Export for use in other modules
export { testConnection };