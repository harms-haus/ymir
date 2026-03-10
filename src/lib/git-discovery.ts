import logger from './logger';

export async function discoverGitRepos(rootPath: string): Promise<string[]> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    logger.info('Starting git repository discovery', { rootPath });
    const repos = await invoke<string[]>('discover_git_repos', { rootPath });
    logger.info('Git repository discovery completed', {
      rootPath,
      foundRepos: repos.length
    });
    return repos;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug('Git repository discovery failed', { rootPath, error: message });
    return [];
  }
}

export default { discoverGitRepos };
