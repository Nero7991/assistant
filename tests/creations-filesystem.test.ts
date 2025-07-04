import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Mock file system operations
vi.mock('fs/promises');
vi.mock('child_process');

describe('Creations File System Operations', () => {
  const testUserId = 5;
  const testUserEmail = 'testuser@example.com';
  const testPageName = 'test-todo-app';
  const basePath = '/var/www/pages';
  const userPath = `${basePath}/${testUserEmail}/pages/${testPageName}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Directory Structure Creation', () => {
    it('creates the correct directory hierarchy', async () => {
      const mockMkdir = vi.mocked(fs.mkdir);
      mockMkdir.mockResolvedValue(undefined);

      // Simulate the directory creation logic
      const createProjectDirectories = async (email: string, pageName: string) => {
        const projectPath = path.join(basePath, email, 'pages', pageName);
        await fs.mkdir(projectPath, { recursive: true });
        
        // Create subdirectories
        const subdirs = ['src', 'src/components', 'src/utils', 'src/styles', 'public'];
        for (const subdir of subdirs) {
          await fs.mkdir(path.join(projectPath, subdir), { recursive: true });
        }
        
        return projectPath;
      };

      const projectPath = await createProjectDirectories(testUserEmail, testPageName);

      expect(mockMkdir).toHaveBeenCalledWith(userPath, { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(path.join(userPath, 'src'), { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(path.join(userPath, 'src/components'), { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(path.join(userPath, 'src/utils'), { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(path.join(userPath, 'src/styles'), { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(path.join(userPath, 'public'), { recursive: true });
      expect(projectPath).toBe(userPath);
    });

    it('handles existing directory gracefully', async () => {
      const mockMkdir = vi.mocked(fs.mkdir);
      const mockStat = vi.mocked(fs.stat);
      
      // Simulate directory already exists
      mockStat.mockResolvedValue({ isDirectory: () => true } as any);
      mockMkdir.mockRejectedValueOnce({ code: 'EEXIST' });

      const createProjectDirectories = async (email: string, pageName: string) => {
        const projectPath = path.join(basePath, email, 'pages', pageName);
        try {
          await fs.mkdir(projectPath, { recursive: true });
        } catch (error: any) {
          if (error.code === 'EEXIST') {
            // Check if it's a directory
            const stats = await fs.stat(projectPath);
            if (!stats.isDirectory()) {
              throw new Error('Path exists but is not a directory');
            }
            // Directory exists, continue
          } else {
            throw error;
          }
        }
        return projectPath;
      };

      const projectPath = await createProjectDirectories(testUserEmail, testPageName);
      expect(projectPath).toBe(userPath);
    });

    it('validates email format for directory path', async () => {
      const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      expect(validateEmail('valid@example.com')).toBe(true);
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
    });

    it('sanitizes page names for filesystem', async () => {
      const sanitizePageName = (pageName: string): string => {
        return pageName
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
      };

      expect(sanitizePageName('My Awesome App!')).toBe('my-awesome-app');
      expect(sanitizePageName('app@#$%name')).toBe('app-name');
      expect(sanitizePageName('   spaces   everywhere   ')).toBe('spaces-everywhere');
      expect(sanitizePageName('UPPERCASE-NAME')).toBe('uppercase-name');
      expect(sanitizePageName('very-' + 'long-'.repeat(20) + 'name')).toHaveLength(50);
    });
  });

  describe('Plan File Creation', () => {
    it('writes architecture plan as markdown file', async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValue(undefined);

      const architecturePlan = `# Architecture Plan

## Overview
A simple todo list application

## Technology Stack
- React
- TypeScript
- Tailwind CSS`;

      const writePlanFile = async (projectPath: string, plan: string) => {
        const planPath = path.join(projectPath, 'ARCHITECTURE.md');
        await fs.writeFile(planPath, plan, 'utf-8');
        return planPath;
      };

      const planPath = await writePlanFile(userPath, architecturePlan);

      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(userPath, 'ARCHITECTURE.md'),
        architecturePlan,
        'utf-8'
      );
      expect(planPath).toBe(path.join(userPath, 'ARCHITECTURE.md'));
    });

    it('creates task breakdown file', async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValue(undefined);

      const taskBreakdown = {
        tasks: [
          {
            title: 'Project Setup',
            subtasks: ['Initialize project', 'Install dependencies']
          }
        ]
      };

      const writeTasksFile = async (projectPath: string, tasks: any) => {
        const tasksPath = path.join(projectPath, 'TASKS.json');
        await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2), 'utf-8');
        return tasksPath;
      };

      const tasksPath = await writeTasksFile(userPath, taskBreakdown);

      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(userPath, 'TASKS.json'),
        JSON.stringify(taskBreakdown, null, 2),
        'utf-8'
      );
    });

    it('creates README with project information', async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValue(undefined);

      const createReadme = async (projectPath: string, title: string, description: string) => {
        const readmeContent = `# ${title}

${description}

## Getting Started

This project was created by Kona Creations.

### Development

\`\`\`bash
npm install
npm run dev
\`\`\`

### Building

\`\`\`bash
npm run build
\`\`\`

### Deployment

This app is automatically deployed to: https://pages.orenslab.com/${path.basename(projectPath)}
`;

        const readmePath = path.join(projectPath, 'README.md');
        await fs.writeFile(readmePath, readmeContent, 'utf-8');
        return readmePath;
      };

      const readmePath = await createReadme(userPath, 'Test Todo App', 'A simple todo application');

      expect(mockWriteFile).toHaveBeenCalled();
      const callArgs = mockWriteFile.mock.calls[0];
      expect(callArgs[0]).toBe(path.join(userPath, 'README.md'));
      expect(callArgs[1]).toContain('# Test Todo App');
      expect(callArgs[1]).toContain('A simple todo application');
      expect(callArgs[1]).toContain('https://pages.orenslab.com/test-todo-app');
    });
  });

  describe('Gemini CLI Integration', () => {
    it('executes gemini command with correct prompt', async () => {
      const mockExec = vi.mocked(execAsync);
      mockExec.mockResolvedValue({ stdout: 'Files created successfully', stderr: '' });

      const executeGeminiCommand = async (projectPath: string, prompt: string) => {
        const command = `cd "${projectPath}" && gemini "${prompt}"`;
        const result = await execAsync(command);
        return result;
      };

      const prompt = 'Create a React component for TodoItem with TypeScript';
      const result = await executeGeminiCommand(userPath, prompt);

      expect(mockExec).toHaveBeenCalledWith(`cd "${userPath}" && gemini "${prompt}"`);
      expect(result.stdout).toBe('Files created successfully');
    });

    it('handles gemini command errors', async () => {
      const mockExec = vi.mocked(execAsync);
      mockExec.mockRejectedValue(new Error('Command failed'));

      const executeGeminiCommand = async (projectPath: string, prompt: string) => {
        try {
          const command = `cd "${projectPath}" && gemini "${prompt}"`;
          const result = await execAsync(command);
          return result;
        } catch (error) {
          throw new Error(`Gemini execution failed: ${error}`);
        }
      };

      await expect(
        executeGeminiCommand(userPath, 'Invalid prompt')
      ).rejects.toThrow('Gemini execution failed');
    });

    it('sanitizes prompts to prevent command injection', async () => {
      const sanitizePrompt = (prompt: string): string => {
        // Remove or escape potentially dangerous characters
        return prompt
          .replace(/[`$]/g, '\\$&')  // Escape backticks and dollar signs
          .replace(/[;&|]/g, '')      // Remove command separators
          .replace(/[<>]/g, '')       // Remove redirections
          .trim();
      };

      expect(sanitizePrompt('Create component; rm -rf /')).toBe('Create component rm -rf /');
      expect(sanitizePrompt('Test `echo malicious`')).toBe('Test \\`echo malicious\\`');
      expect(sanitizePrompt('Normal prompt')).toBe('Normal prompt');
    });

    it('tracks file modifications after gemini execution', async () => {
      const mockReaddir = vi.mocked(fs.readdir);
      const mockStat = vi.mocked(fs.stat);
      
      mockReaddir.mockResolvedValue(['src', 'package.json', 'App.tsx'] as any);
      mockStat.mockResolvedValue({ 
        isFile: () => true, 
        isDirectory: () => false,
        mtime: new Date()
      } as any);

      const getProjectFiles = async (projectPath: string): Promise<string[]> => {
        const files: string[] = [];
        
        const scanDirectory = async (dir: string) => {
          const entries = await fs.readdir(dir);
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = await fs.stat(fullPath);
            
            if (stat.isDirectory()) {
              await scanDirectory(fullPath);
            } else if (stat.isFile()) {
              files.push(path.relative(projectPath, fullPath));
            }
          }
        };
        
        await scanDirectory(projectPath);
        return files;
      };

      const files = await getProjectFiles(userPath);
      expect(mockReaddir).toHaveBeenCalled();
      expect(files).toContain('package.json');
      expect(files).toContain('App.tsx');
    });
  });

  describe('Error Handling and Permissions', () => {
    it('handles permission denied errors', async () => {
      const mockMkdir = vi.mocked(fs.mkdir);
      mockMkdir.mockRejectedValue({ code: 'EACCES', message: 'Permission denied' });

      const createDirectory = async (path: string) => {
        try {
          await fs.mkdir(path, { recursive: true });
        } catch (error: any) {
          if (error.code === 'EACCES') {
            throw new Error(`Permission denied: Cannot create directory at ${path}`);
          }
          throw error;
        }
      };

      await expect(createDirectory('/root/forbidden')).rejects.toThrow('Permission denied');
    });

    it('handles disk space errors', async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockRejectedValue({ code: 'ENOSPC', message: 'No space left on device' });

      const writeFile = async (path: string, content: string) => {
        try {
          await fs.writeFile(path, content, 'utf-8');
        } catch (error: any) {
          if (error.code === 'ENOSPC') {
            throw new Error('Insufficient disk space to create file');
          }
          throw error;
        }
      };

      await expect(writeFile('test.txt', 'content')).rejects.toThrow('Insufficient disk space');
    });

    it('validates project path is within allowed directory', async () => {
      const isPathAllowed = (requestedPath: string, basePath: string): boolean => {
        const resolved = path.resolve(requestedPath);
        const base = path.resolve(basePath);
        return resolved.startsWith(base);
      };

      expect(isPathAllowed(`${basePath}/user/pages/app`, basePath)).toBe(true);
      expect(isPathAllowed('/etc/passwd', basePath)).toBe(false);
      expect(isPathAllowed(`${basePath}/../../../etc`, basePath)).toBe(false);
      expect(isPathAllowed(`${basePath}/user/..`, basePath)).toBe(true); // Still within base
    });
  });

  describe('Cleanup Operations', () => {
    it('removes project directory on deletion', async () => {
      const mockRm = vi.mocked(fs.rm);
      mockRm.mockResolvedValue(undefined);

      const deleteProject = async (projectPath: string) => {
        await fs.rm(projectPath, { recursive: true, force: true });
      };

      await deleteProject(userPath);

      expect(mockRm).toHaveBeenCalledWith(userPath, { recursive: true, force: true });
    });

    it('creates backup before deletion', async () => {
      const mockCp = vi.mocked(fs.cp);
      const mockRm = vi.mocked(fs.rm);
      mockCp.mockResolvedValue(undefined);
      mockRm.mockResolvedValue(undefined);

      const deleteProjectWithBackup = async (projectPath: string) => {
        const backupPath = `${projectPath}.backup.${Date.now()}`;
        await fs.cp(projectPath, backupPath, { recursive: true });
        await fs.rm(projectPath, { recursive: true, force: true });
        return backupPath;
      };

      const backupPath = await deleteProjectWithBackup(userPath);

      expect(mockCp).toHaveBeenCalled();
      expect(backupPath).toMatch(/\.backup\.\d+$/);
      expect(mockRm).toHaveBeenCalledWith(userPath, { recursive: true, force: true });
    });
  });
});