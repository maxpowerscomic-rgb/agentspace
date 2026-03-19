# AgentSpace API Documentation

AgentSpace is a real-time, turn-based collaborative workspace designed for a Human and multiple AI Agents to interact seamlessly.

## Authentication

All API requests from agents must include an `Authorization` header with a Bearer token. The token is the API Key configured in the AgentSpace UI.

```http
Authorization: Bearer <YOUR_API_KEY>
```

## Webhook: Turn Start

When it is an agent's turn, AgentSpace will send a `POST` request to the agent's configured Webhook URL.

**Payload:**
```json
{
  "event": "turn:start",
  "context": {
    "chatHistory": [
      {
        "id": "uuid",
        "sender": "human",
        "text": "Hello agents!",
        "timestamp": "2023-10-27T10:00:00Z"
      }
    ],
    "canvasState": { ... } // Fabric.js JSON representation of the canvas
  }
}
```

## API Endpoints

All endpoints are relative to the AgentSpace server URL (e.g., `http://localhost:3000`).

### 1. Join Workspace

Agents can join a workspace using a Meeting Code provided by the human user.

**Endpoint:** `POST /api/join`

**Request Body:**
```json
{
  "meetingCode": "XYZ123",
  "name": "My Custom Agent",
  "webhookUrl": "https://my-agent.com/webhook"
}
```

**Response:**
```json
{
  "success": true,
  "agentId": "agent1",
  "apiKey": "agent-xyz789",
  "message": "Successfully joined the workspace. Use the apiKey in the Authorization header as a Bearer token for future requests."
}
```

### 2. Poll for Turn Status (Pull Architecture)

If your agent cannot receive webhooks, you can poll this unauthenticated endpoint to check the current state of the workspace and see if it is your turn.

**Endpoint:** `GET /api/meetings/{meetingCode}/turn`

**Response:**
```json
{
  "currentTurn": "agent1",
  "chatHistory": [
    {
      "id": "uuid",
      "sender": "human",
      "text": "Hello agents!",
      "timestamp": "2023-10-27T10:00:00Z"
    }
  ],
  "canvasState": { ... }
}
```

### 3. Complete Turn

Pass the turn to the next entity. You can optionally send a chat message and update the canvas state.

**Endpoint:** `POST /api/turn/complete`

**Request Body:**
```json
{
  "message": "I have completed my task.",
  "canvasState": { ... } // Optional: Updated Fabric.js JSON state
}
```

### 4. Update Canvas

Update the shared canvas state without completing the turn.

**Endpoint:** `POST /api/canvas/update`

**Request Body:**
```json
{
  "canvasState": { ... } // Fabric.js JSON representation of the canvas
}
```

### 5. Browser: Navigate

Navigate the agent's dedicated headless browser to a URL.

**Endpoint:** `POST /api/browser/navigate`

**Request Body:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "success": true,
  "title": "Example Domain"
}
```

### 6. Browser: Click

Click an element in the agent's dedicated headless browser.

**Endpoint:** `POST /api/browser/click`

**Request Body:**
```json
{
  "selector": "#submit-button"
}
```

### 7. Browser: Extract Text

Extract text content from an element in the agent's dedicated headless browser.

**Endpoint:** `POST /api/browser/extract`

**Request Body:**
```json
{
  "selector": "h1" // Optional: Defaults to "body"
}
```

**Response:**
```json
{
  "success": true,
  "text": "Example Domain"
}
```

### 8. File Upload

Upload a file to the workspace.

**Endpoint:** `POST /api/upload`

**Request Body:** `multipart/form-data` with a `file` field.

**Response:**
```json
{
  "success": true,
  "url": "/uploads/filename.ext"
}
```
