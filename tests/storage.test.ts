import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IndexedDbProjects, type Project } from '../src/storage/projects';

const opened: IndexedDbProjects[] = [];
const create = (name = crypto.randomUUID()) => { const store = new IndexedDbProjects(name); opened.push(store); return store; };
afterEach(async () => { await Promise.all(opened.splice(0).map((store) => store.close())); });
const project: Project = { id: 'session-01', name: 'afterhours', code: 'bpm 95\nscale D_minor', languageVersion: '0.1', settings: { masterVolume: 0.4 }, kits: ['trip'], updatedAt: '2026-11-10T13:00:00.000Z' };

describe('local project persistence', () => {
  it('recovers complete projects from a new repository instance', async () => {
    const database = crypto.randomUUID();
    const first = create(database);
    await first.save(project);
    await first.close();
    const reopened = create(database);
    expect(await reopened.get(project.id)).toEqual(project);
  });
  it('replaces the saved revision without duplicating the project', async () => {
    const store = create();
    await store.save(project);
    await store.save({ ...project, code: 'bpm 120', settings: { masterVolume: 0.8 } });
    expect(await store.list()).toEqual([{ ...project, code: 'bpm 120', settings: { masterVolume: 0.8 } }]);
  });
  it('sorts by latest save and removes only the selected project', async () => {
    const store = create();
    const later = { ...project, id: 'session-02', updatedAt: '2026-11-10T14:00:00.000Z' };
    await store.save(project); await store.save(later);
    expect((await store.list()).map((p) => p.id)).toEqual(['session-02', 'session-01']);
    await store.remove(later.id);
    expect(await store.get(later.id)).toBeUndefined();
    expect(await store.get(project.id)).toEqual(project);
  });
});
