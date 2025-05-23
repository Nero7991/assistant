# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kona is a full-stack web application designed to assist individuals with executive dysfunction through task management, scheduling, and AI-powered coaching features. It uses AI features for natural language interaction and offers communication through web, SMS, and email channels.

## Branding

- **Name**: Kona
- **Tagline**: "Your kind and encouraging AI personal assistant"
- **Value Proposition**: Helps users stay accountable towards tasks and life goals via text messages while providing executive function support.
- **Brand Voice**: Kind, encouraging, supportive
- **Core Features**:
  - Kind, encouraging text messages
  - Accountability for tasks & goals
  - Executive function support
  - Open conversation on any topic

## Functional Knowledge

- **Creator**: Built by Oren's Lab
- **User Experience**:
  - Users register with email and optionally WhatsApp for notifications
  - Users can add personal facts to help Kona understand their context
  - Tasks can be created, scheduled, and tracked through the system
  - Daily schedules help users structure their day
  - The chat interface allows natural language interaction with the AI assistant
  
- **Communication Methods**:
  - Web interface (chat page)
  - WhatsApp messages (for reminders and check-ins)
  - Email notifications
  
- **Support for Executive Dysfunction**:
  - Breaks down large tasks into manageable subtasks
  - Sends timely reminders about upcoming tasks and deadlines
  - Provides encouraging messages rather than judgmental ones
  - Helps users create structured daily schedules
  - Tracks recurring tasks to build habits
  - Offers accountability through check-ins

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Shadcn/UI, Zustand
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL (Neon), Drizzle ORM
- **Communication**: Twilio (for SMS), SendGrid (for email)
- **AI**: OpenAI, Google Gemini (through API integration)
- **Testing**: Vitest, Testing Library
- **Authentication**: Passport.js
- **Validation**: Zod

## Common Commands

### Development

```bash
# Start the development server
npm run dev

# Build the project for production
npm run build

# Start the production server
npm run start

# Type checking
npm run check
```

### Database Operations

```bash
# Push schema changes to the database
npm run db:push

# Generate migration files
npm run db:generate

# Apply migrations
npm run db:migrate
```

### Testing

```bash
# Run all tests
npx vitest

# Run a specific test file
npx vitest tests/test-schedule-parsing.ts

# Run tests with UI
npx vitest --ui
```

## Project Architecture

### Directory Structure

- **client/**: React frontend
  - **src/**: Source code
    - **components/**: UI components
    - **context/**: React context providers
    - **hooks/**: Custom React hooks
    - **lib/**: Utilities
    - **pages/**: Application pages
- **server/**: Express backend
  - **api/**: API endpoints
  - **services/**: Business logic
    - **llm/**: LLM provider integrations
  - **routes.ts**: Route definitions
  - **index.ts**: Server entry point
- **shared/**: Shared code between client and server
  - **schema.ts**: Database schema definitions using Drizzle ORM
- **tests/**: Server-side tests
- **migrations/**: Database migration files

### Key Architectural Components

1. **Database Schema**: The application uses Drizzle ORM with a PostgreSQL database. Schema definitions are in `shared/schema.ts`. Main entities include:
   - Users (authentication, preferences)
   - Tasks and Subtasks (user's to-do items)
   - Schedule Items (time-blocked activities)
   - Daily Schedules (collection of schedule items for a day)
   - Message Schedules (notifications/reminders to be sent)
   - Known User Facts (information about the user for personalization)

2. **Authentication**: Uses Passport.js with local strategy for username/password authentication.

3. **LLM Integration**:
   - Supports multiple LLM providers (OpenAI, Google Gemini)
   - LLM functions in `server/services/llm-functions.ts`
   - Used for natural language processing of user requests and task/schedule generation

4. **Scheduled Jobs**:
   - Uses node-schedule to run background processes:
     - Process pending message schedules (every minute)
     - Schedule recurring tasks (daily at 00:01 UTC)
     - Schedule follow-ups for uncompleted tasks (every 15 minutes)

5. **Messaging System**:
   - Handles SMS notifications through Twilio
   - Email communication through SendGrid
   - User preferences control notification frequency and type

6. **Agentic Interaction**:
   - The app uses an agentic approach for handling user requests
   - LLM helps interpret natural language, extract intents, and perform actions
   - Follows a workflow of receiving input, recognizing intent, checking information sufficiency, gathering additional info if needed, executing functions, and responding to users

## Testing Approach

The project uses Vitest for testing:

1. **Client Tests**: Located in `client/src/__tests__/`
   - Component tests with React Testing Library
   - Mock server using MSW for API testing

2. **Server Tests**: Located in `tests/`
   - API endpoint tests
   - Database query tests
   - LLM function tests
   - Schedule management tests

When adding new features, be sure to add appropriate tests for both client and server components.