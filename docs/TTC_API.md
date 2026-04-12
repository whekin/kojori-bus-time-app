# TTC (Tbilisi Transport Company) API Documentation

## Base URL
```
https://transit.ttc.com.ge/pis-gateway/api
```

## Authentication
All requests require the `x-api-key` header:
```
x-api-key: c0a2f304-551a-4d08-b8df-2c53ecd57f9f
```

## Key Routes for Kojori

### Bus 380
- Route ID: `1:R97505`
- Pattern Suffix: `1:01` (Kojori → Tbilisi)
- Pattern Suffix: `0:01` (Tbilisi → Kojori)

### Bus 316
- Route ID: `1:R98445`
- Pattern Suffix: `0:01` (Kojori → Tbilisi)
- Pattern Suffix: `1:01` (Tbilisi → Kojori)

## Key Stops in Kojori

| Stop Name | Stop ID | Code |
|-----------|---------|------|
| Kojori, Vazha-Pshavela St #56 | 1:2856 | 2856 |
| Kojori Iunkeri St #16 | 1:4181 | 4181 |
| Kojori, Alexandre Chkheidze Street | 1:3782 | 3782 |
| Kojori Center | 1:3078 | 3078 |

## Endpoints

### 1. Get Arrival Times (Real-time + Schedule)
```
GET /v2/stops/{stopId}/arrival-times?locale=en&ignoreScheduledArrivalTimes=false
```

**Example:**
```bash
curl -H "x-api-key: c0a2f304-551a-4d08-b8df-2c53ecd57f9f" \
  "https://transit.ttc.com.ge/pis-gateway/api/v2/stops/1:4181/arrival-times?locale=en&ignoreScheduledArrivalTimes=false"
```

**Response:**
```json
[
  {
    "shortName": "380",
    "color": "00B38B",
    "headsign": "Baratashvili St",
    "patternSuffix": "1:01",
    "vehicleMode": "BUS",
    "realtime": true,
    "realtimeArrivalMinutes": 26,
    "scheduledArrivalMinutes": 23
  }
]
```

### 2. Get Route Schedule
```
GET /v3/routes/{routeId}/schedule?patternSuffix={patternSuffix}&locale=en
```

**Example:**
```bash
curl -H "x-api-key: c0a2f304-551a-4d08-b8df-2c53ecd57f9f" \
  "https://transit.ttc.com.ge/pis-gateway/api/v3/routes/1:R97505/schedule?patternSuffix=1:01&locale=en"
```

**Response:**
```json
[
  {
    "fromDay": "MONDAY",
    "toDay": "SUNDAY",
    "serviceDates": ["2026-04-12", "2026-04-13"],
    "stops": [
      {
        "name": "Kojori, Vazha-Pshavela St #56",
        "id": "1:2856",
        "position": 1,
        "arrivalTimes": "7:05,7:38,8:22,9:00,9:39,10:17..."
      }
    ]
  }
]
```

### 3. Get Stops for Route Pattern
```
GET /v3/routes/{routeId}/stops-of-patterns?patternSuffixes={patternSuffix}&locale=en
```

**Example:**
```bash
curl -H "x-api-key: c0a2f304-551a-4d08-b8df-2c53ecd57f9f" \
  "https://transit.ttc.com.ge/pis-gateway/api/v3/routes/1:R97505/stops-of-patterns?patternSuffixes=1:01&locale=en"
```

### 4. Get Vehicle Positions
```
GET /v3/routes/{routeId}/positions?patternSuffixes={patternSuffix}
```

**Response:**
```json
{
  "1:01": [
    {
      "vehicleId": "1:3553",
      "lat": 41.6673241,
      "lon": 44.7619438,
      "heading": 9.98979377746582,
      "nextStopId": "1:3645"
    }
  ]
}
```

### 5. Get Stop Details
```
GET /v2/stops/{stopId}?locale=en
```

### 6. Get All Routes
```
GET /v3/routes?modes=BUS&locale=en
```

### 7. Get Route Polyline
```
GET /v3/routes/{routeId}/polylines?patternSuffixes={patternSuffix}
```

## Usage Notes

- `realtimeArrivalMinutes`: Actual arrival time based on GPS tracking
- `scheduledArrivalMinutes`: Scheduled arrival time from timetable
- Drift = `realtimeArrivalMinutes - scheduledArrivalMinutes`
- Buses often arrive 5-10 minutes earlier than scheduled on middle/end stops
- Starting stop schedules are most accurate
