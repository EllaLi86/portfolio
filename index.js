import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

const projects = await fetchJSON('./lib/projects.json');
const latestProjects = projects.slice(0, 3);

// On the home page, show each project's short summary instead of the full description
const latestBriefs = latestProjects.map((project) => ({
  ...project,
  description: project.summary ?? project.description,
}));

const projectsContainer = document.querySelector('.projects');

renderProjects(latestBriefs, projectsContainer, 'h2');

const githubData = await fetchGitHubData('EllaLi86');

const profileStats = document.querySelector('#profile-stats');

if (profileStats && githubData) {
  profileStats.innerHTML = `
        <dl>
          <dt>Public Repos:</dt><dd>${githubData.public_repos}</dd>
          <dt>Public Gists:</dt><dd>${githubData.public_gists}</dd>
          <dt>Followers:</dt><dd>${githubData.followers}</dd>
          <dt>Following:</dt><dd>${githubData.following}</dd>
        </dl>
    `;
}
