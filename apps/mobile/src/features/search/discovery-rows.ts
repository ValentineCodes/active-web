import type { SearchDiscoverCategory } from '@/features/search/discovery-api';
import type {
  DiscoverPayload,
  SearchDiscoverListRow,
  SearchPersonRow,
  SearchRequestRow,
  SearchProjectRow,
} from '@/features/search/discovery-types';

function personRow(person: SearchPersonRow): SearchDiscoverListRow {
  return {
    kind: 'person',
    key: `person-${person.user_id}`,
    person,
    href: `/u/${person.username}`,
  };
}

function requestRow(request: SearchRequestRow, keySuffix: string): SearchDiscoverListRow {
  return {
    kind: 'request',
    key: `request-${keySuffix}`,
    request,
  };
}

function projectRow(project: SearchProjectRow, keySuffix: string): SearchDiscoverListRow {
  return {
    kind: 'project',
    key: `project-${keySuffix}`,
    project,
    href: `/project/${project.project_id}`,
  };
}

export function buildTopDiscoverRows(payload: DiscoverPayload): SearchDiscoverListRow[] {
  const rows: SearchDiscoverListRow[] = [];
  const requests = (payload.requests ?? []) as SearchRequestRow[];
  const people = payload.people ?? [];
  const projects = (payload.projects ?? []) as SearchProjectRow[];

  if (requests.length > 0) {
    rows.push({ kind: 'section', key: 'section-requests', title: 'Requests' });
    for (const [index, request] of requests.entries()) {
      rows.push(requestRow(request, `top-${request.request_id ?? index}`));
    }
  }
  if (people.length > 0) {
    rows.push({ kind: 'section', key: 'section-people', title: 'People' });
    for (const person of people) {
      rows.push(personRow(person));
    }
  }
  if (projects.length > 0) {
    rows.push({ kind: 'section', key: 'section-projects', title: 'Projects' });
    for (const [index, project] of projects.entries()) {
      rows.push(projectRow(project, `top-${project.project_id ?? index}`));
    }
  }
  return rows;
}

export function flattenDiscoverPages(
  category: SearchDiscoverCategory,
  pages: { offset: number; data: DiscoverPayload }[],
): SearchDiscoverListRow[] {
  const rows: SearchDiscoverListRow[] = [];
  const seenPeople = new Set<string>();
  const seenRequests = new Set<string>();
  const seenProjects = new Set<string>();

  for (const page of pages) {
    if (category === 'people') {
      for (const person of page.data.people ?? []) {
        if (seenPeople.has(person.user_id)) continue;
        seenPeople.add(person.user_id);
        rows.push(personRow(person));
      }
      continue;
    }

    if (category === 'requests') {
      for (const request of (page.data.requests ?? []) as SearchRequestRow[]) {
        if (seenRequests.has(request.request_id)) continue;
        seenRequests.add(request.request_id);
        rows.push(requestRow(request, `${page.offset}-${request.request_id}`));
      }
      continue;
    }

    if (category === 'projects') {
      for (const project of (page.data.projects ?? []) as SearchProjectRow[]) {
        if (seenProjects.has(project.project_id)) continue;
        seenProjects.add(project.project_id);
        rows.push(projectRow(project, `${page.offset}-${project.project_id}`));
      }
    }
  }

  return rows;
}