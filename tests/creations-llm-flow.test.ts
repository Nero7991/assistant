import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateArchitecturePlan, generateTaskBreakdown } from '../server/services/llm-functions';

// Mock the OpenAI provider
const mockGenerateCompletion = vi.fn();
vi.mock('../server/services/llm/openai_provider', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    generateCompletion: mockGenerateCompletion
  }))
}));

describe('Creations LLM Conversation Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateCompletion.mockClear();
  });

  describe('generateArchitecturePlan', () => {
    it('generates a comprehensive architecture plan for a simple app', async () => {
      const title = 'Todo List App';
      const description = 'A simple todo list application where users can add, complete, and delete tasks';
      
      const expectedResponse = `# Architecture Plan

## Overview
A lightweight, responsive todo list application built with modern web technologies focusing on simplicity and user experience.

## Technology Stack
- **Frontend Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS for utility-first styling
- **State Management**: React Context API for simple state management
- **Build Tool**: Vite for fast development and optimized builds
- **Storage**: LocalStorage for persisting todos

## Component Structure
\`\`\`
src/
├── components/
│   ├── TodoList.tsx      # Main todo list container
│   ├── TodoItem.tsx      # Individual todo item component
│   ├── AddTodo.tsx       # Form for adding new todos
│   └── FilterBar.tsx     # Filter todos by status
├── contexts/
│   └── TodoContext.tsx   # Global todo state management
├── types/
│   └── todo.ts          # TypeScript interfaces
├── utils/
│   └── storage.ts       # LocalStorage helpers
└── App.tsx              # Main application component
\`\`\`

## Data Flow and Architecture Patterns
1. **Unidirectional Data Flow**: Actions flow from components to context, state updates flow back to components
2. **Component Composition**: Small, focused components that compose into larger features
3. **Type Safety**: Full TypeScript coverage for compile-time safety
4. **Responsive Design**: Mobile-first approach using Tailwind's responsive utilities

## Key Features Implementation
1. **Add Todo**: Form validation, unique ID generation, optimistic UI updates
2. **Complete Todo**: Toggle completion state with visual feedback
3. **Delete Todo**: Confirmation dialog, smooth animations
4. **Filter Todos**: Show all/active/completed with URL state sync
5. **Persist Data**: Auto-save to LocalStorage on every change

## Key Considerations and Constraints
- **Performance**: Use React.memo for todo items to prevent unnecessary re-renders
- **Accessibility**: Full keyboard navigation, ARIA labels, focus management
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge latest versions)
- **Mobile Experience**: Touch-friendly UI, appropriate tap targets
- **Data Validation**: Prevent empty todos, sanitize input
- **Error Handling**: Graceful fallbacks for LocalStorage failures`;

      mockGenerateCompletion.mockResolvedValueOnce({
        content: expectedResponse
      });

      const result = await generateArchitecturePlan(1, title, description);

      // Verify the prompt includes the title and description
      expect(mockGenerateCompletion).toHaveBeenCalledWith(
        'gpt-4o',
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(title) && expect.stringContaining(description)
          })
        ]),
        0.7
      );

      expect(result).toBe(expectedResponse);
      expect(result).toContain('Architecture Plan');
      expect(result).toContain('Technology Stack');
      expect(result).toContain('Component Structure');
    });

    it('handles complex application requirements', async () => {
      const title = 'E-commerce Dashboard';
      const description = 'An admin dashboard for managing products, orders, and customers with real-time analytics';
      
      const complexResponse = `# Architecture Plan

## Overview
A comprehensive e-commerce admin dashboard with real-time data visualization and management capabilities.

## Technology Stack
- **Frontend**: React 18 + TypeScript
- **UI Library**: Ant Design or Material-UI for enterprise components
- **Charts**: Chart.js or Recharts for data visualization
- **State Management**: Redux Toolkit for complex state
- **Data Fetching**: React Query for server state management
- **Build Tool**: Vite
- **Mock API**: JSON Server for development

## Component Structure
[Complex nested structure with multiple modules]

## Key Considerations
- Role-based access control
- Real-time updates via polling
- Responsive data tables
- Export functionality`;

      mockGenerateCompletion.mockResolvedValueOnce({
        content: complexResponse
      });

      const result = await generateArchitecturePlan(1, title, description);

      expect(result).toContain('e-commerce');
      expect(result).toContain('real-time');
      expect(result).toContain('Redux Toolkit'); // For complex state
    });

    it('handles LLM errors gracefully', async () => {
      mockGenerateCompletion.mockRejectedValueOnce(new Error('OpenAI API error'));

      await expect(
        generateArchitecturePlan('Test App', 'Test description')
      ).rejects.toThrow('Failed to generate architecture plan');
    });

    it('handles empty responses', async () => {
      mockGenerateCompletion.mockResolvedValueOnce({ content: '' });

      const result = await generateArchitecturePlan('Test App', 'Test description');
      expect(result).toBe('');
    });
  });

  describe('generateTaskBreakdown', () => {
    it('generates detailed task breakdown from architecture plan', async () => {
      const title = 'Todo List App';
      const description = 'A simple todo list application';
      const architecturePlan = '# Architecture Plan\n\nReact + TypeScript + Tailwind';

      const expectedTasks = [
        {
          title: 'Project Setup and Configuration',
          description: 'Initialize the project with all required dependencies and configurations',
          category: 'setup',
          estimatedDuration: '30m',
          geminiPrompt: 'Create a new Vite project with React and TypeScript. Install and configure Tailwind CSS with PostCSS. Set up the basic project structure with src/components, src/contexts, src/types, and src/utils directories.',
          subtasks: [
            {
              title: 'Initialize Vite Project',
              description: 'Create new Vite project with React TypeScript template',
              estimatedDuration: '10m',
              filesPaths: ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html'],
              geminiPrompt: 'Initialize a new Vite project with: npm create vite@latest todo-app -- --template react-ts'
            },
            {
              title: 'Configure Tailwind CSS',
              description: 'Install and set up Tailwind CSS with PostCSS',
              estimatedDuration: '10m',
              filesPaths: ['tailwind.config.js', 'postcss.config.js', 'src/index.css'],
              geminiPrompt: 'Install Tailwind CSS: npm install -D tailwindcss postcss autoprefixer. Initialize config files and set up Tailwind directives in index.css'
            },
            {
              title: 'Create Project Structure',
              description: 'Set up the directory structure and initial files',
              estimatedDuration: '10m',
              filesPaths: ['src/components/.gitkeep', 'src/contexts/.gitkeep', 'src/types/.gitkeep', 'src/utils/.gitkeep'],
              geminiPrompt: 'Create the directory structure: components, contexts, types, and utils folders under src/'
            }
          ]
        },
        {
          title: 'Create Type Definitions and Context',
          description: 'Define TypeScript interfaces and set up global state management',
          category: 'backend',
          estimatedDuration: '45m',
          geminiPrompt: 'Create TypeScript interfaces for Todo items and set up React Context for state management',
          subtasks: [
            {
              title: 'Define Todo Types',
              description: 'Create TypeScript interfaces for the todo data structure',
              estimatedDuration: '15m',
              filesPaths: ['src/types/todo.ts'],
              geminiPrompt: 'Create todo.ts with interfaces: Todo (id: string, text: string, completed: boolean, createdAt: Date)'
            },
            {
              title: 'Create Todo Context',
              description: 'Set up React Context for global todo state management',
              estimatedDuration: '30m',
              filesPaths: ['src/contexts/TodoContext.tsx'],
              geminiPrompt: 'Create TodoContext with provider component. Include state for todos array and methods: addTodo, toggleTodo, deleteTodo, filterTodos'
            }
          ]
        },
        {
          title: 'Build Core Components',
          description: 'Create the main UI components for the todo application',
          category: 'frontend',
          estimatedDuration: '2h',
          geminiPrompt: 'Build all the React components needed for the todo list functionality',
          subtasks: [
            {
              title: 'Create AddTodo Component',
              description: 'Build the form for adding new todo items',
              estimatedDuration: '30m',
              filesPaths: ['src/components/AddTodo.tsx'],
              geminiPrompt: 'Create AddTodo component with input field and submit button. Include form validation to prevent empty todos. Use Tailwind classes for styling.'
            },
            {
              title: 'Create TodoItem Component',
              description: 'Build individual todo item with complete and delete actions',
              estimatedDuration: '30m',
              filesPaths: ['src/components/TodoItem.tsx'],
              geminiPrompt: 'Create TodoItem component displaying todo text, checkbox for completion, and delete button. Add strikethrough style for completed items.'
            },
            {
              title: 'Create TodoList Component',
              description: 'Build the main container for displaying all todos',
              estimatedDuration: '30m',
              filesPaths: ['src/components/TodoList.tsx'],
              geminiPrompt: 'Create TodoList component that maps over todos array and renders TodoItem components. Include empty state message.'
            },
            {
              title: 'Create FilterBar Component',
              description: 'Build filter controls for showing all/active/completed todos',
              estimatedDuration: '30m',
              filesPaths: ['src/components/FilterBar.tsx'],
              geminiPrompt: 'Create FilterBar with three buttons: All, Active, Completed. Update context filter state on click.'
            }
          ]
        },
        {
          title: 'Implement Local Storage and Utils',
          description: 'Add data persistence and utility functions',
          category: 'backend',
          estimatedDuration: '45m',
          geminiPrompt: 'Implement LocalStorage integration for persisting todos',
          subtasks: [
            {
              title: 'Create Storage Utils',
              description: 'Build helper functions for LocalStorage operations',
              estimatedDuration: '20m',
              filesPaths: ['src/utils/storage.ts'],
              geminiPrompt: 'Create storage.ts with functions: saveTodos, loadTodos, clearTodos. Handle JSON parsing/stringifying and error cases.'
            },
            {
              title: 'Integrate Storage with Context',
              description: 'Connect LocalStorage to Todo Context for auto-save',
              estimatedDuration: '25m',
              filesPaths: ['src/contexts/TodoContext.tsx'],
              geminiPrompt: 'Update TodoContext to load todos from LocalStorage on mount and save on every state change using useEffect'
            }
          ]
        },
        {
          title: 'Style and Polish Application',
          description: 'Apply Tailwind styles and enhance UI/UX',
          category: 'styling',
          estimatedDuration: '1h',
          geminiPrompt: 'Apply comprehensive Tailwind CSS styling to all components',
          subtasks: [
            {
              title: 'Style App Layout',
              description: 'Create responsive layout with proper spacing',
              estimatedDuration: '20m',
              filesPaths: ['src/App.tsx', 'src/App.css'],
              geminiPrompt: 'Update App.tsx with Tailwind classes for centered container, max-width, padding. Add header with app title.'
            },
            {
              title: 'Enhance Component Styles',
              description: 'Polish all component appearances with Tailwind',
              estimatedDuration: '25m',
              filesPaths: ['src/components/AddTodo.tsx', 'src/components/TodoItem.tsx', 'src/components/TodoList.tsx', 'src/components/FilterBar.tsx'],
              geminiPrompt: 'Apply Tailwind classes: forms, buttons, hover states, transitions, shadows, rounded corners, colors'
            },
            {
              title: 'Add Animations',
              description: 'Include smooth transitions and micro-interactions',
              estimatedDuration: '15m',
              filesPaths: ['src/index.css', 'tailwind.config.js'],
              geminiPrompt: 'Add CSS transitions for todo item additions/deletions, button hover effects, and completion toggling'
            }
          ]
        }
      ];

      mockGenerateCompletion.mockResolvedValueOnce({
        content: JSON.stringify(expectedTasks)
      });

      const result = await generateTaskBreakdown(1, title, description, architecturePlan);

      // Verify the prompt includes all required information
      expect(mockGenerateCompletion).toHaveBeenCalledWith(
        'gpt-4o',
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(title) && 
                    expect.stringContaining(description) && 
                    expect.stringContaining(architecturePlan)
          })
        ]),
        0.3,
        true // JSON mode
      );

      expect(result).toEqual(expectedTasks);
      expect(result).toHaveLength(5);
      expect(result[0].category).toBe('setup');
      expect(result[0].subtasks).toHaveLength(3);
    });

    it('ensures proper task categories', async () => {
      const mockTasks = [
        { title: 'Setup', category: 'setup', subtasks: [] },
        { title: 'Backend', category: 'backend', subtasks: [] },
        { title: 'Frontend', category: 'frontend', subtasks: [] },
        { title: 'Styling', category: 'styling', subtasks: [] },
        { title: 'Testing', category: 'testing', subtasks: [] },
      ];

      mockGenerateCompletion.mockResolvedValueOnce({
        content: JSON.stringify(mockTasks)
      });

      const result = await generateTaskBreakdown('App', 'Description', 'Plan');

      const categories = result.map(task => task.category);
      expect(categories).toContain('setup');
      expect(categories).toContain('frontend');
      expect(categories.every(cat => 
        ['setup', 'backend', 'frontend', 'styling', 'testing', 'deployment'].includes(cat)
      )).toBe(true);
    });

    it('handles malformed JSON response', async () => {
      mockGenerateCompletion.mockResolvedValueOnce({
        content: 'This is not valid JSON'
      });

      await expect(
        generateTaskBreakdown(1, 'App', 'Description', 'Plan')
      ).rejects.toThrow('Failed to generate task breakdown');
    });

    it('returns empty array for empty response', async () => {
      mockGenerateCompletion.mockResolvedValueOnce({
        content: '[]'
      });

      const result = await generateTaskBreakdown('App', 'Description', 'Plan');
      expect(result).toEqual([]);
    });

    it('validates gemini prompts are included', async () => {
      const tasksWithPrompts = [
        {
          title: 'Setup Project',
          description: 'Initialize project',
          category: 'setup',
          estimatedDuration: '30m',
          geminiPrompt: 'Create a new React project with TypeScript',
          subtasks: [
            {
              title: 'Install Dependencies',
              description: 'Install required packages',
              estimatedDuration: '10m',
              filesPaths: ['package.json'],
              geminiPrompt: 'Run npm install for all dependencies'
            }
          ]
        }
      ];

      mockGenerateCompletion.mockResolvedValueOnce({
        content: JSON.stringify(tasksWithPrompts)
      });

      const result = await generateTaskBreakdown('App', 'Description', 'Plan');

      expect(result[0].geminiPrompt).toBeTruthy();
      expect(result[0].subtasks[0].geminiPrompt).toBeTruthy();
    });
  });

  describe('Conversation Flow Scenarios', () => {
    it('handles iterative refinement of requirements', async () => {
      // Scenario: User provides vague initial description
      const initialDescription = 'I want to build a chat app';
      
      // LLM asks for clarification (this would be in the actual chat flow)
      const clarificationQuestions = [
        'What type of chat app? (1-on-1, group chat, public rooms?)',
        'Do you need user authentication?',
        'Should messages be persistent or temporary?',
        'Any specific features like file sharing, emojis, typing indicators?'
      ];

      // User provides more details
      const refinedDescription = 'A simple 1-on-1 chat app with user authentication, persistent messages, and typing indicators. No file sharing needed.';

      // Generate architecture based on refined requirements
      const detailedArchitecture = `# Architecture Plan

## Overview
A real-time 1-on-1 chat application with user authentication and typing indicators.

## Technology Stack
- **Frontend**: React + TypeScript
- **UI**: Tailwind CSS + Headless UI
- **State**: Zustand for simple state management
- **Real-time**: Socket.io-client (simulated for static deployment)
- **Auth**: Simulated auth with localStorage
- **Storage**: localStorage for message persistence

## Features
1. User registration/login (simulated)
2. Contact list
3. 1-on-1 messaging
4. Typing indicators
5. Message persistence
6. Online/offline status`;

      mockGenerateCompletion.mockResolvedValueOnce({
        content: detailedArchitecture
      });

      const result = await generateArchitecturePlan('Chat App', refinedDescription);

      expect(result).toContain('1-on-1 chat');
      expect(result).toContain('authentication');
      expect(result).toContain('typing indicators');
      expect(result).not.toContain('file sharing'); // Explicitly excluded
    });

    it('adapts to technical constraints', async () => {
      // Scenario: User mentions it's a static site only
      const description = 'A todo app that must work as a static site with no backend';

      const constrainedArchitecture = `# Architecture Plan

## Overview
A fully client-side todo application with no backend dependencies.

## Technology Stack
- **Framework**: React with TypeScript
- **Storage**: LocalStorage for data persistence
- **Routing**: React Router for client-side routing
- **Deployment**: Static hosting (GitHub Pages, Netlify, Vercel)

## Constraints Addressed
- No backend API calls
- All data stored locally
- Works offline after initial load
- Can be deployed as static files
- No user authentication (single-user app)`;

      mockGenerateCompletion.mockResolvedValueOnce({
        content: constrainedArchitecture
      });

      const result = await generateArchitecturePlan('Static Todo App', description);

      expect(result).toContain('client-side');
      expect(result).toContain('LocalStorage');
      expect(result).toContain('static');
      expect(result).toContain('No backend API calls');
    });

    it('handles complex multi-feature applications', async () => {
      const complexDescription = 'An educational platform where teachers can create quizzes, students can take them, and see their results with progress tracking';

      const complexTasks = [
        {
          title: 'Setup Multi-Role Application',
          category: 'setup',
          estimatedDuration: '1h',
          subtasks: [
            { title: 'Configure role-based routing', filesPaths: ['src/routes/index.tsx'] },
            { title: 'Set up role contexts', filesPaths: ['src/contexts/RoleContext.tsx'] }
          ]
        },
        {
          title: 'Teacher Features',
          category: 'frontend',
          estimatedDuration: '4h',
          subtasks: [
            { title: 'Quiz creator interface', filesPaths: ['src/components/teacher/QuizCreator.tsx'] },
            { title: 'Question bank', filesPaths: ['src/components/teacher/QuestionBank.tsx'] },
            { title: 'Student progress viewer', filesPaths: ['src/components/teacher/ProgressDashboard.tsx'] }
          ]
        },
        {
          title: 'Student Features',
          category: 'frontend',
          estimatedDuration: '3h',
          subtasks: [
            { title: 'Quiz list view', filesPaths: ['src/components/student/QuizList.tsx'] },
            { title: 'Quiz taking interface', filesPaths: ['src/components/student/QuizTaker.tsx'] },
            { title: 'Results dashboard', filesPaths: ['src/components/student/Results.tsx'] }
          ]
        }
      ];

      mockGenerateCompletion
        .mockResolvedValueOnce({ content: 'Complex architecture...' })
        .mockResolvedValueOnce({ content: JSON.stringify(complexTasks) });

      const archPlan = await generateArchitecturePlan(1, 'Education Platform', complexDescription);
      const tasks = await generateTaskBreakdown(1, 'Education Platform', complexDescription, archPlan);

      // Verify it handles multiple user roles
      const taskTitles = tasks.map(t => t.title);
      expect(taskTitles.some(title => title.includes('Teacher') || title.includes('teacher'))).toBe(true);
      expect(taskTitles.some(title => title.includes('Student') || title.includes('student'))).toBe(true);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('handles API rate limiting gracefully', async () => {
      mockGenerateCompletion.mockRejectedValueOnce({
        response: { status: 429, statusText: 'Too Many Requests' }
      });

      await expect(
        generateArchitecturePlan(1, 'App', 'Description')
      ).rejects.toThrow('Failed to generate architecture plan');
    });

    it('handles network timeouts', async () => {
      mockGenerateCompletion.mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      await expect(
        generateArchitecturePlan(1, 'App', 'Description')
      ).rejects.toThrow('Failed to generate architecture plan');
    });

    it('handles partial task generation', async () => {
      // Simulate incomplete task list
      const partialTasks = [
        {
          title: 'Setup Project',
          category: 'setup',
          // Missing required fields like subtasks
        }
      ];

      mockGenerateCompletion.mockResolvedValueOnce({
        content: JSON.stringify(partialTasks)
      });

      const result = await generateTaskBreakdown('App', 'Description', 'Plan');
      
      // Should still return what it can parse
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Setup Project');
    });
  });
});