# NoboJatra

## Intro
A smart travel-planning web app for comparing routes, estimating fares, checking live conditions, and saving repeat journeys — all in one place.

---

## Description
NoboJatra is a full-stack travel planning application built for everyday commuters who want a simpler way to choose the best route for their trip. Users can search from one place to another, compare route options, review traffic and weather conditions, estimate fares for different transport modes, and revisit saved trips whenever needed.

The app combines route intelligence, fare estimation, map visualization, and trip history into a single experience that helps users make faster and more informed travel decisions.

---

## Website-
Live at: https://nobojatra.onrender.com

---

### What you can do:
- Sign up and sign in with email and password
- Search for trips between locations with route suggestions
- Compare multiple route options based on travel time and practicality
- View route details on a map and inspect trip segments
- Estimate fares across supported transport providers and vehicle types
- Check weather-aware fare restrictions and route conditions
- Save frequently used locations and repeat journeys
- Manage scheduled trips and trip history
- View upcoming trips and travel summaries on the dashboard
- Explore live camera feeds for route monitoring
- Review best option rankings based on travel and fare factors

---

## Tech Stack
- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **BetterAuth** (authentication & session management)
- **MongoDB** (database)
- **Mongoose** (schemas & models)
- **OpenRouteService** (routing data)
- **OpenWeatherMap** (weather-aware fare logic)
- **TomTom** (live traffic delays and traffic map overlay)
- **Nominatim / OpenStreetMap** (place search and map tiles)
- **Leaflet** (maps)
- **Resend** (password reset emails)

---

## Local Setup

### Requirements
- Node.js 20.9 or later (developed on Node 24)
- pnpm
- A MongoDB database (for example, a free MongoDB Atlas cluster)

### 1) Install dependencies
```bash
pnpm install
```

### 2) Create your `.env`
Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | What it's for |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | No | Database for app and auth data. Defaults to `nobojatra`. Changing it on an existing database hides every existing account |
| `BETTER_AUTH_SECRET` | Yes | Random string used to sign sessions (for example `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Yes | The app's URL, for example `http://localhost:3000` |
| `ORS_API_KEY` | Yes | OpenRouteService key for route search |
| `OPENWEATHER_API_KEY` | Recommended | Weather conditions and weather-based fare rules |
| `TOMTOM_API_KEY` | Optional | Live traffic. Without it, traffic is unavailable |
| `RESEND_API_KEY` | Optional | Sending password reset emails |
| `RESEND_FROM_EMAIL` | Optional | Sender address. Must be on a domain verified in Resend (see Known Issues) |
| `PATHAO_FARE_API` | Optional | Live fare quotes. Without it, fares come from the built-in rate card |
| `ALERT_EVALUATION_SECRET` | Optional | Protects the scheduled alert-check endpoint |
| `NOMINATIM_USER_AGENT` | Optional | Identifies the app to the place-search service. Include a contact email |
| `NEXT_PUBLIC_TM_MODEL_URL` | Optional | Image model used by photo search |

Never commit `.env` or put a real key in the code. A secret scan runs on every pull request and on every push to `main`.

### 3) Seed the fare rates
```bash
pnpm seed:rates
```

### 4) Start the app
```bash
pnpm dev
```
Then open http://localhost:3000.

---

## Contributions
Contributions are welcome!

### You can contribute by:
- Reporting bugs or issues
- Suggesting new features or improvements
- Refactoring code for better performance or readability
- Improving the UI or making it more responsive
- Enhancing documentation and onboarding

### How to contribute:

### 1) Fork the repository

### 2) Clone your fork
```bash
git clone https://github.com/YOUR_USERNAME/nobojatra.git
```

### 3) Create a new branch
```bash
git checkout -b feature-name
```

### 4) Make your changes and commit
```bash
git commit -m "Add: your feature description"
```

### 5) Push to your fork
```bash
git push origin feature-name
```

### 6) Open a Pull Request on GitHub

---

## ⚠️ Known Issues
- Some route and fare features depend on external APIs being available
- Weather and traffic data may fall back gracefully when providers are unavailable
- Map-driven experiences are best validated with a configured environment and provider keys
- Large route requests may be rate-limited depending on usage
- Password reset emails are only delivered to the Resend account owner's address. The app sends from Resend's testing sender, because this is a demo without a verified email domain. For any other address the page reports success, but no email is sent.
- TomTom has no live traffic data for Bangladesh, so in Dhaka the traffic overlay is blank and traffic delays show as zero. Traffic works in cities TomTom covers, such as London.

---

## Future Development
- Better route comparison filters and smarter ranking logic
- More detailed trip analytics and monthly travel summaries
- Improved saved trip management and automated trip reminders
- Expanded live traffic and camera integrations
- Additional fare providers and region coverage
- Better loading, empty, and error states across the app
- Mobile-first polish and more accessible interaction design
- Exporting trip history and fare summaries for users

### Fun fact
The app was named after Bangladesh's only naval submarine unit "BNS Nobojatra"
