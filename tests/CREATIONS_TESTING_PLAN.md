# Creations Feature Testing Plan

## Overview

This document outlines the comprehensive testing strategy for the Creations feature in Kona. The Creations feature allows users to describe web application ideas, have AI generate architecture plans and task breakdowns, and autonomously build the applications using Gemini CLI.

## Testing Architecture

### Test Pyramid Structure

```
                    E2E Tests (3 files)
                   /                   \
              Integration Tests      Manual Testing
             /                    \
        Unit Tests                  Performance Tests
       /          \                /                \
  Frontend      Backend      LLM Flow      File System
  Components    APIs         Tests         Operations
```

## Test Files Overview

### 1. Frontend Unit Tests
**File**: `client/src/__tests__/creations-page.test.tsx`

**Purpose**: Test React components and user interactions

**Test Categories**:
- **Initial Load**: Loading states, empty states, error handling
- **Creations List**: Display, status badges, progress bars, deployment links
- **Creation Selection**: Details view, highlighting, tab navigation
- **Create Dialog**: Form validation, submission, page name preview
- **Actions**: Generate plan, start building, deletion with confirmation
- **Error Handling**: API failures, network errors, validation errors

**Key Test Scenarios**:
```typescript
// Example test structure
describe('CreationsPage', () => {
  describe('Initial Load', () => {
    it('renders the page header correctly')
    it('shows loading state while fetching')
    it('displays empty state when no creations exist')
    it('displays error message when fetch fails')
  })
  
  describe('Create Creation Dialog', () => {
    it('opens dialog when "New Creation" button is clicked')
    it('validates required fields')
    it('creates a new creation successfully')
    it('shows page name preview')
  })
})
```

### 2. Backend API Integration Tests
**File**: `tests/creations-api.test.ts`

**Purpose**: Test REST API endpoints and database operations

**Test Categories**:
- **CRUD Operations**: Create, read, update, delete creations
- **Plan Generation**: Architecture plan creation and task breakdown
- **Build Process**: Starting build, status transitions
- **Authentication**: User isolation, permission checks
- **Data Validation**: Input validation, business rules
- **Error Handling**: Invalid inputs, not found errors, server errors

**Key Test Scenarios**:
```typescript
describe('Creations API', () => {
  describe('POST /api/creations', () => {
    it('creates a new creation with auto-generated page name')
    it('creates a creation with custom page name')
    it('ensures unique page names')
    it('validates required fields')
  })
  
  describe('POST /api/creations/:id/plan', () => {
    it('generates architecture plan and creates tasks')
    it('reverts status on plan generation failure')
  })
})
```

### 3. LLM Conversation Flow Tests
**File**: `tests/creations-llm-flow.test.ts`

**Purpose**: Test AI conversation flow and prompt engineering

**Test Categories**:
- **Architecture Generation**: Plan quality, technology recommendations
- **Task Breakdown**: Proper categorization, Gemini prompts, file paths
- **Conversation Scenarios**: Requirement refinement, constraint handling
- **Error Recovery**: API failures, malformed responses, timeouts
- **Edge Cases**: Complex applications, iterative refinement

**Key Test Scenarios**:
```typescript
describe('Creations LLM Flow', () => {
  describe('generateArchitecturePlan', () => {
    it('generates comprehensive plan for simple app')
    it('handles complex application requirements')
    it('adapts to technical constraints')
  })
  
  describe('Conversation Flow Scenarios', () => {
    it('handles iterative refinement of requirements')
    it('adapts to technical constraints')
    it('handles complex multi-feature applications')
  })
})
```

### 4. File System Operations Tests
**File**: `tests/creations-filesystem.test.ts`

**Purpose**: Test file and directory operations for project creation

**Test Categories**:
- **Directory Creation**: Proper hierarchy, permissions, validation
- **File Operations**: Plan writing, README creation, task files
- **Gemini Integration**: Command execution, prompt sanitization, file tracking
- **Security**: Path validation, command injection prevention
- **Error Handling**: Permission denied, disk space, cleanup operations

**Key Test Scenarios**:
```typescript
describe('Creations File System Operations', () => {
  describe('Directory Structure Creation', () => {
    it('creates the correct directory hierarchy')
    it('handles existing directory gracefully')
    it('validates email format for directory path')
    it('sanitizes page names for filesystem')
  })
  
  describe('Gemini CLI Integration', () => {
    it('executes gemini command with correct prompt')
    it('sanitizes prompts to prevent command injection')
    it('tracks file modifications after execution')
  })
})
```

### 5. End-to-End Tests
**File**: `tests/creations-e2e.test.ts`

**Purpose**: Test complete user workflows from idea to deployment

**Test Categories**:
- **Complete Workflow**: Full creation lifecycle
- **User Experience**: Multiple creations, deletion, isolation
- **Edge Cases**: Invalid data, status transitions, recovery
- **Integration**: All components working together

**Key Test Scenarios**:
```typescript
describe('Creations End-to-End Flow', () => {
  it('follows the full creation lifecycle from idea to deployment', async () => {
    // 1. User describes idea
    // 2. AI generates plan
    // 3. User approves
    // 4. Build process starts
    // 5. Files are created
    // 6. Deployment happens
  })
  
  it('handles iterative requirement refinement')
  it('recovers from build failures gracefully')
})
```

## Test Data Management

### Mock Data Structure
```typescript
const mockCreations = [
  {
    id: 1,
    title: 'Todo App',
    description: 'A simple todo list application',
    status: 'completed',
    pageName: 'todo-app',
    deploymentUrl: 'https://pages.orenslab.com/todo-app',
    totalTasks: 5,
    completedTasks: 5,
    totalSubtasks: 15,
    completedSubtasks: 15,
    architecturePlan: '# Architecture Plan...',
    // ... other fields
  }
];
```

### Test User Credentials
```typescript
const mockUser = {
  id: 5,
  username: 'testuser',
  email: 'testuser@example.com'
};
```

## Testing the Complete Creation Flow

### 1. User Describes Idea (Brainstorming Phase)
**Flow**: User provides title and description
```
Input: { title: "Todo App", description: "Simple task management" }
Expected: Creation with status 'brainstorming'
```

### 2. LLM Brainstorms Requirements
**Flow**: AI analyzes description and asks clarifying questions
```
Mock Response: Architecture plan with technology recommendations
Expected: Status changes to 'planning'
```

### 3. User Addresses Requirements
**Flow**: User provides additional details and constraints
```
Input: Refined description with specific requirements
Expected: More detailed architecture plan
```

### 4. LLM Creates Plan of Action
**Flow**: AI generates detailed implementation plan
```
Output: Tasks and subtasks with Gemini prompts
Expected: Status changes to 'approved'
```

### 5. User Reviews and Approves
**Flow**: User can modify plan or approve for building
```
Action: User clicks "Start Building"
Expected: Status changes to 'building'
```

### 6. Implementation Begins
**Flow**: System creates folders and begins Gemini CLI execution
```
Actions:
- Create project directory: /var/www/pages/{email}/pages/{pagename}
- Write ARCHITECTURE.md with plan
- Execute Gemini prompts sequentially
- Track progress and file modifications
```

## Mocking Strategy

### LLM Provider Mocking
```typescript
vi.mock('../server/services/llm/openai_provider', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    generateCompletion: vi.fn()
  }))
}));
```

### File System Mocking
```typescript
vi.mock('fs/promises');
vi.mock('child_process');

const mockMkdir = vi.mocked(fs.mkdir);
const mockWriteFile = vi.mocked(fs.writeFile);
```

### Database Operations
```typescript
// Clean up test data before each test
beforeEach(async () => {
  await db.delete(creationSubtasks).where(eq(creationSubtasks.creationId, 999));
  await db.delete(creationTasks).where(eq(creationTasks.creationId, 999));
  await db.delete(creations).where(eq(creations.userId, mockUser.id));
});
```

## Error Scenarios Testing

### 1. LLM API Failures
- Rate limiting (429 errors)
- Network timeouts
- Invalid responses
- Malformed JSON

### 2. File System Errors
- Permission denied
- Disk space exhaustion
- Path traversal attempts
- Command injection

### 3. Database Constraints
- Unique constraint violations
- Foreign key constraints
- Transaction rollbacks

### 4. User Input Validation
- Missing required fields
- Invalid data formats
- SQL injection attempts
- XSS prevention

## Performance Testing Considerations

### 1. LLM Response Times
- Measure generation time for different complexity levels
- Test timeout handling
- Monitor token usage

### 2. File Operations
- Directory creation performance
- Large file handling
- Concurrent operations

### 3. Database Queries
- Creation list pagination
- Complex joins for details view
- Index usage optimization

## Running the Tests

### Individual Test Suites
```bash
# Frontend unit tests
npm run test client/src/__tests__/creations-page.test.tsx

# Backend API tests
npm run test tests/creations-api.test.ts

# LLM flow tests
npm run test tests/creations-llm-flow.test.ts

# File system tests
npm run test tests/creations-filesystem.test.ts

# End-to-end tests
npm run test tests/creations-e2e.test.ts
```

### Full Test Suite
```bash
# Run all Creations tests
npm run test -- --grep="creation"

# Run with coverage
npm run test:coverage
```

## Test Environment Setup

### Prerequisites
1. Test database with clean schema
2. Mock file system directories
3. LLM provider API keys (for integration tests)
4. Gemini CLI installed (for full integration)

### Environment Variables
```bash
TEST_DATABASE_URL=postgresql://...
TEST_LLM_PROVIDER=openai
TEST_GEMINI_PATH=/usr/local/bin/gemini
TEST_BASE_PATH=/tmp/test-projects
```

## Continuous Integration

### Test Pipeline
1. **Unit Tests**: Run on every commit
2. **Integration Tests**: Run on PR creation
3. **E2E Tests**: Run on main branch updates
4. **Performance Tests**: Run nightly

### Coverage Requirements
- Unit Tests: 90%+ coverage
- Integration Tests: 80%+ API coverage
- E2E Tests: 100% critical path coverage

## Manual Testing Scenarios

### 1. User Experience Testing
- Create various types of applications
- Test with different complexity levels
- Verify UI responsiveness and feedback

### 2. AI Quality Testing
- Evaluate architecture plan quality
- Check task breakdown accuracy
- Validate Gemini prompt effectiveness

### 3. Integration Testing
- Full workflow with real LLM
- Actual file creation and Gemini execution
- Deployment verification

## Monitoring and Observability

### Test Metrics
- Test execution time
- Flaky test identification
- Coverage trends
- Failure analysis

### Production Metrics
- Creation success rates
- LLM response times
- File operation performance
- User satisfaction scores

## Future Test Enhancements

### 1. Visual Regression Testing
- Screenshot comparison for UI changes
- Cross-browser compatibility
- Mobile responsiveness

### 2. Load Testing
- Concurrent creation handling
- LLM rate limiting behavior
- File system scalability

### 3. Security Testing
- Authentication bypass attempts
- Authorization validation
- Input sanitization verification

### 4. Accessibility Testing
- Screen reader compatibility
- Keyboard navigation
- WCAG compliance

---

## Summary

This comprehensive testing plan ensures the Creations feature works reliably across all user scenarios. The test suite covers:

- ✅ **Frontend Components** - User interface and interactions
- ✅ **Backend APIs** - Data operations and business logic  
- ✅ **LLM Integration** - AI conversation and plan generation
- ✅ **File Operations** - Project creation and file management
- ✅ **End-to-End Flow** - Complete user journeys
- ✅ **Error Handling** - Graceful failure recovery
- ✅ **Security** - Input validation and command injection prevention
- ✅ **Performance** - Response times and resource usage

The tests provide confidence that users can successfully create, plan, and build web applications through the Creations feature while maintaining security, performance, and reliability standards.