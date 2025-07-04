import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import CreationsPage from '@/pages/creations-page';
import { server } from './mocks/server';
import { http, HttpResponse } from 'msw';

// Mock data
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
    architecturePlan: '# Architecture Plan\n\nReact + TypeScript + Tailwind',
    estimatedDuration: '2h',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T02:00:00Z',
    completedAt: '2024-01-01T02:00:00Z',
  },
  {
    id: 2,
    title: 'Weather Dashboard',
    description: 'Real-time weather information dashboard',
    status: 'building',
    pageName: 'weather-dashboard',
    deploymentUrl: 'https://pages.orenslab.com/weather-dashboard',
    totalTasks: 6,
    completedTasks: 3,
    totalSubtasks: 20,
    completedSubtasks: 10,
    estimatedDuration: '4h',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T01:00:00Z',
  },
  {
    id: 3,
    title: 'Portfolio Site',
    description: 'Personal portfolio website',
    status: 'brainstorming',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
    totalTasks: 0,
    completedTasks: 0,
    totalSubtasks: 0,
    completedSubtasks: 0,
  },
];

const mockCreationDetails = {
  creation: mockCreations[0],
  tasks: [
    {
      id: 1,
      creationId: 1,
      title: 'Setup Project',
      description: 'Initialize React project with TypeScript',
      status: 'completed',
      category: 'setup',
      orderIndex: 0,
      estimatedDuration: '30m',
      totalSubtasks: 3,
      completedSubtasks: 3,
    },
    {
      id: 2,
      creationId: 1,
      title: 'Create Components',
      description: 'Build core UI components',
      status: 'completed',
      category: 'frontend',
      orderIndex: 1,
      estimatedDuration: '1h',
      totalSubtasks: 5,
      completedSubtasks: 5,
    },
  ],
  subtasks: [
    {
      id: 1,
      creationId: 1,
      taskId: 1,
      title: 'Initialize npm project',
      description: 'Run npm init and install dependencies',
      status: 'completed',
      orderIndex: 0,
      estimatedDuration: '10m',
    },
    {
      id: 2,
      creationId: 1,
      taskId: 1,
      title: 'Configure TypeScript',
      description: 'Setup tsconfig.json',
      status: 'completed',
      orderIndex: 1,
      estimatedDuration: '10m',
    },
  ],
};

describe('CreationsPage', () => {
  beforeEach(() => {
    // Reset handlers to default
    server.resetHandlers();
  });

  describe('Initial Load', () => {
    it('renders the page header correctly', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([]);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Creations')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Brainstorm, plan, and autonomously build web applications')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /new creation/i })).toBeInTheDocument();
    });

    it('shows loading state while fetching creations', async () => {
      server.use(
        http.get('/api/creations', async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return HttpResponse.json([]);
        })
      );

      render(<CreationsPage />);

      expect(screen.getByText('Loading creations...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading creations...')).not.toBeInTheDocument();
      });
    });

    it('displays empty state when no creations exist', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([]);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('No creations yet. Start by creating your first web app!')).toBeInTheDocument();
      });
    });

    it('displays error message when fetch fails', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 });
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load creations')).toBeInTheDocument();
      });
    });
  });

  describe('Creations List', () => {
    it('displays all creations correctly', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json(mockCreations);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
        expect(screen.getByText('Weather Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Portfolio Site')).toBeInTheDocument();
      });
    });

    it('shows correct status badges', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json(mockCreations);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(screen.getByText('Building')).toBeInTheDocument();
        expect(screen.getByText('Brainstorming')).toBeInTheDocument();
      });
    });

    it('displays progress bars for creations with tasks', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json(mockCreations);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        const progressBars = screen.getAllByRole('progressbar');
        expect(progressBars).toHaveLength(2); // Only completed and building have progress
      });
    });

    it('shows deployment URL for completed creations', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json(mockCreations);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        const liveAppLink = screen.getByText('View Live App');
        expect(liveAppLink).toBeInTheDocument();
        expect(liveAppLink.closest('a')).toHaveAttribute('href', 'https://pages.orenslab.com/todo-app');
      });
    });
  });

  describe('Creation Selection', () => {
    it('shows creation details when clicked', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json(mockCreations);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json(mockCreationDetails);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        // Check if details are shown
        expect(screen.getByText('Setup Project')).toBeInTheDocument();
        expect(screen.getByText('Create Components')).toBeInTheDocument();
      });
    });

    it('highlights selected creation', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json(mockCreations);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json(mockCreationDetails);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      expect(todoCard).toHaveClass('ring-2', 'ring-primary');
    });
  });

  describe('Create Creation Dialog', () => {
    it('opens dialog when "New Creation" button is clicked', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([]);
        })
      );

      render(<CreationsPage />);

      const newCreationButton = screen.getByRole('button', { name: /new creation/i });
      fireEvent.click(newCreationButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Create New Web App')).toBeInTheDocument();
    });

    it('validates required fields', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([]);
        })
      );

      const user = userEvent.setup();
      render(<CreationsPage />);

      const newCreationButton = screen.getByRole('button', { name: /new creation/i });
      await user.click(newCreationButton);

      const createButton = screen.getByRole('button', { name: /create & start planning/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Title and description are required')).toBeInTheDocument();
      });
    });

    it('creates a new creation successfully', async () => {
      const newCreation = {
        id: 4,
        title: 'New App',
        description: 'A brand new application',
        status: 'brainstorming',
        pageName: 'new-app',
        deploymentUrl: 'https://pages.orenslab.com/new-app',
        totalTasks: 0,
        completedTasks: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        createdAt: '2024-01-04T00:00:00Z',
        updatedAt: '2024-01-04T00:00:00Z',
      };

      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([]);
        }),
        http.post('/api/creations', async ({ request }) => {
          const body = await request.json();
          return HttpResponse.json({ ...newCreation, ...body });
        })
      );

      const user = userEvent.setup();
      render(<CreationsPage />);

      const newCreationButton = screen.getByRole('button', { name: /new creation/i });
      await user.click(newCreationButton);

      const titleInput = screen.getByLabelText('Title');
      const descriptionTextarea = screen.getByLabelText('Description');
      const pageNameInput = screen.getByLabelText('Page Name (Optional)');

      await user.type(titleInput, 'New App');
      await user.type(descriptionTextarea, 'A brand new application for testing');
      await user.type(pageNameInput, 'new-app');

      // Update the mock to return the new creation in the list
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([newCreation]);
        })
      );

      const createButton = screen.getByRole('button', { name: /create & start planning/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('New App')).toBeInTheDocument();
      });
    });

    it('shows page name preview', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([]);
        })
      );

      const user = userEvent.setup();
      render(<CreationsPage />);

      const newCreationButton = screen.getByRole('button', { name: /new creation/i });
      await user.click(newCreationButton);

      const pageNameInput = screen.getByLabelText('Page Name (Optional)');
      await user.type(pageNameInput, 'my-awesome-app');

      expect(screen.getByText('https://pages.orenslab.com/my-awesome-app')).toBeInTheDocument();
    });
  });

  describe('Creation Actions', () => {
    it('shows "Generate Plan" button for brainstorming status', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[2]]); // Brainstorming status
        }),
        http.get('/api/creations/3', () => {
          return HttpResponse.json({ creation: mockCreations[2], tasks: [], subtasks: [] });
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Portfolio Site')).toBeInTheDocument();
      });

      const portfolioCard = screen.getByText('Portfolio Site').closest('[class*="card"]');
      fireEvent.click(portfolioCard!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate plan/i })).toBeInTheDocument();
      });
    });

    it('generates architecture plan', async () => {
      const updatedCreation = { ...mockCreations[2], status: 'planning' };

      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[2]]);
        }),
        http.get('/api/creations/3', () => {
          return HttpResponse.json({ creation: mockCreations[2], tasks: [], subtasks: [] });
        }),
        http.post('/api/creations/3/plan', () => {
          return HttpResponse.json({ message: 'Architecture plan generated successfully' });
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Portfolio Site')).toBeInTheDocument();
      });

      const portfolioCard = screen.getByText('Portfolio Site').closest('[class*="card"]');
      fireEvent.click(portfolioCard!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate plan/i })).toBeInTheDocument();
      });

      // Update mock to return updated status
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([updatedCreation]);
        })
      );

      const generatePlanButton = screen.getByRole('button', { name: /generate plan/i });
      fireEvent.click(generatePlanButton);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /generate plan/i })).not.toBeInTheDocument();
      });
    });

    it('shows "Start Building" button for approved status', async () => {
      const approvedCreation = { ...mockCreations[0], status: 'approved' };

      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([approvedCreation]);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json({ creation: approvedCreation, tasks: [], subtasks: [] });
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /start building/i })).toBeInTheDocument();
      });
    });

    it('deletes creation with confirmation', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[0]]);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json(mockCreationDetails);
        }),
        http.delete('/api/creations/1', () => {
          return HttpResponse.json({ message: 'Creation deleted successfully' });
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete/i });
        expect(deleteButton).toBeInTheDocument();
      });

      // Update mock to return empty list after deletion
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([]);
        })
      );

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this creation?');

      await waitFor(() => {
        expect(screen.queryByText('Todo App')).not.toBeInTheDocument();
      });

      confirmSpy.mockRestore();
    });
  });

  describe('Creation Details Tabs', () => {
    it('shows overview tab by default', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[0]]);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json(mockCreationDetails);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /overview/i })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Created')).toBeInTheDocument();
        expect(screen.getByText('Last Updated')).toBeInTheDocument();
      });
    });

    it('shows architecture tab when plan exists', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[0]]);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json(mockCreationDetails);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /architecture/i })).toBeInTheDocument();
      });

      const architectureTab = screen.getByRole('tab', { name: /architecture/i });
      fireEvent.click(architectureTab);

      expect(screen.getByText(/React \+ TypeScript \+ Tailwind/)).toBeInTheDocument();
    });

    it('shows tasks tab with task details', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[0]]);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json(mockCreationDetails);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /tasks/i })).toBeInTheDocument();
      });

      const tasksTab = screen.getByRole('tab', { name: /tasks/i });
      fireEvent.click(tasksTab);

      expect(screen.getByText('Setup Project')).toBeInTheDocument();
      expect(screen.getByText('Initialize React project with TypeScript')).toBeInTheDocument();
      expect(screen.getByText('Initialize npm project')).toBeInTheDocument();
      expect(screen.getByText('Configure TypeScript')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles creation details fetch error', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[0]]);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 });
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        expect(screen.getByText('Failed to load creation details')).toBeInTheDocument();
      });
    });

    it('handles plan generation error', async () => {
      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[2]]);
        }),
        http.get('/api/creations/3', () => {
          return HttpResponse.json({ creation: mockCreations[2], tasks: [], subtasks: [] });
        }),
        http.post('/api/creations/3/plan', () => {
          return HttpResponse.json({ error: 'Failed to generate plan' }, { status: 500 });
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Portfolio Site')).toBeInTheDocument();
      });

      const portfolioCard = screen.getByText('Portfolio Site').closest('[class*="card"]');
      fireEvent.click(portfolioCard!);

      await waitFor(() => {
        const generatePlanButton = screen.getByRole('button', { name: /generate plan/i });
        fireEvent.click(generatePlanButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to generate architecture plan')).toBeInTheDocument();
      });
    });

    it('handles build start error', async () => {
      const approvedCreation = { ...mockCreations[0], status: 'approved' };

      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([approvedCreation]);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json({ creation: approvedCreation, tasks: [], subtasks: [] });
        }),
        http.post('/api/creations/1/build', () => {
          return HttpResponse.json({ error: 'Failed to start building' }, { status: 500 });
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        const startBuildingButton = screen.getByRole('button', { name: /start building/i });
        fireEvent.click(startBuildingButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to start building')).toBeInTheDocument();
      });
    });

    it('cancels deletion when user declines confirmation', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      server.use(
        http.get('/api/creations', () => {
          return HttpResponse.json([mockCreations[0]]);
        }),
        http.get('/api/creations/1', () => {
          return HttpResponse.json(mockCreationDetails);
        })
      );

      render(<CreationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Todo App')).toBeInTheDocument();
      });

      const todoCard = screen.getByText('Todo App').closest('[class*="card"]');
      fireEvent.click(todoCard!);

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete/i });
        fireEvent.click(deleteButton);
      });

      expect(confirmSpy).toHaveBeenCalled();
      
      // Creation should still exist
      expect(screen.getByText('Todo App')).toBeInTheDocument();

      confirmSpy.mockRestore();
    });
  });
});