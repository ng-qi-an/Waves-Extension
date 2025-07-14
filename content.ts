import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

console.log("Content script loaded on:", window.location.href)

// Listen for messages from background script
const api = typeof (globalThis as any).browser !== 'undefined' ? (globalThis as any).browser : chrome;

api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    console.log("Content script received request for page content:", request)
    
    try {
      // Get only the page's text content
      const pageText = document.body.innerText
      
      console.log("Sending page text from content script")
      sendResponse({
        success: true,
        data: pageText
      })
      
    } catch (error) {
      console.error("Error retrieving page content in content script:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        url: window.location.href
      })
    }
    
    return true // Keep the message channel open for async response
  }
})