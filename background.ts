import { io } from "socket.io-client"

const api = typeof (globalThis as any).browser !== 'undefined' ? (globalThis as any).browser : chrome;

async function getActiveTab(){
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
    
  console.log("Tabs query result:", tabs); // Debug log
  
  if (!tabs || tabs.length === 0) {
    console.log("No tabs found or tabs permission missing");
    return null;
  }
  
  return tabs[0];
}

const socket = io("http://localhost:7323", {
   transports: ['websocket']
})
console.log("hello");

socket.on("connect", () => {
  console.log("Connected to the server");
  socket.emit("getVideoTranscript", {videoId: "JNljnRcu_hE"})
});

socket.on("getVideoId", async(data) => {
  const activeTab = await getActiveTab();
  const url = new URL(activeTab.url);
  if ((url.hostname !== "www.youtube.com" && url.hostname !== "youtube.com") || !url.searchParams.get("v")) {
    return socket.emit("getVideoId", {"status": "ERROR", error: "Not a YouTube Video!"})
  }
  return socket.emit("getVideoId", {"status": "OK", videoId: url.searchParams.get("v"), title: activeTab.title });
});

socket.on("getPageContent", async (data) => {
  console.log("Background received request for page content:", data);
  
  try {    
    // Get the active tab
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    
    console.log("Tabs query result:", tabs); // Debug log
    
    if (!tabs || tabs.length === 0) {
      console.log("No tabs found or tabs permission missing");
      socket.emit("getPageContent", { 
        status: "ERROR",
        error: "No tabs found or missing tabs permission" 
      });
      return;
    }
    
    const activeTab = tabs[0];
    
    if (!activeTab?.id) {
      console.error("No active tab found");
      socket.emit("getPageContent", { 
        status: "ERROR",
        error: "No active tab found" 
      });
      return;
    }
    
    console.log("Active tab found:", activeTab.id, activeTab.url); // Debug log
    
    // Send message to content script in the active tab
    api.tabs.sendMessage(
      activeTab.id,
      { action: "getPageContent", data },
      (response) => {
        const lastError = api.runtime.lastError;
        if (lastError) {
          console.error("Error communicating with content script:", lastError);
          socket.emit("getPageContent", { 
            status: "ERROR",
            error: lastError.message 
          });
          return;
        }
        
        if (response?.success) {
          console.log("Page content retrieved:", response.data);
          socket.emit("getPageContent", {
            status: "OK",
            tabId: activeTab.id,
            tabUrl: activeTab.url,
            content: response.data
          });
        } else {
          console.error("Content script error:", response?.error);
          socket.emit("getPageContent", { 
            status: "ERROR",
            error: response?.error || "Unknown error from content script" 
          });
        }
      }
    );
    
  } catch (error) {
    console.error("Error in background script:", error);
    socket.emit("getPageContent", { 
      status: "ERROR",
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
})

socket.on("connect_error", (err) => console.error("❌ Connect error:", err))
socket.on("disconnect", () => console.warn("⚠️ Disconnected"))

export {}
