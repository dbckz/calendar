import { parseAgentWorkContainers } from '../containers';

describe('parseAgentWorkContainers', () => {
  it('reads fenced section with indented skill lines', () => {
    const description = `Go to this https://example.com\n\n~~~\nagent_work_containers:\n    ~flight-finder\n    Draft a short prep note\n~~~\n`;
    expect(parseAgentWorkContainers(description)).toEqual(['~flight-finder', 'Draft a short prep note']);
  });

  it('reads bullet list and stops at next section', () => {
    const description = `agent_work_containers:\n• ~flight-finder\n• Draft memo\n\nNotes:\nIgnore this`;
    expect(parseAgentWorkContainers(description)).toEqual(['~flight-finder', 'Draft memo']);
  });

  it('returns an empty list when the section is absent', () => {
    expect(parseAgentWorkContainers('Just some notes with no marker')).toEqual([]);
    expect(parseAgentWorkContainers(undefined)).toEqual([]);
  });
});
