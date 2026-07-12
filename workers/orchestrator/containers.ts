const SECTION_HEADER_RE = /^agent_work_containers:\s*$/i;
const BULLET_RE = /^[•*\-]\s*/;

export function parseAgentWorkContainers(description?: string | null): string[] {
  if (!description) return [];

  const lines = description.split(/\r?\n/);
  const containers: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!inSection) {
      if (SECTION_HEADER_RE.test(trimmed)) {
        inSection = true;
      }
      continue;
    }

    if (!trimmed) {
      if (containers.length > 0) break;
      continue;
    }

    if (trimmed === '~~~' || trimmed === '```') {
      continue;
    }

    if (/^[A-Za-z0-9_-]+:\s*$/.test(trimmed) && !trimmed.startsWith('~')) {
      break;
    }

    const value = trimmed.replace(BULLET_RE, '').trim();
    if (value) {
      containers.push(value);
    }
  }

  return containers;
}

export function isSkillContainer(container: string): boolean {
  return container.startsWith('~');
}

export function skillNameFromContainer(container: string): string {
  return container.replace(/^~/, '').trim();
}
