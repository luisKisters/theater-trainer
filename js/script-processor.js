const FIXTURE_SCRIPT = {
  title: 'Test Scene',
  author: 'Test Author',
  language: 'en',
  characters: [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ],
  lines: [
    { character_id: 'alice', text: 'Hello Bob, how are you?' },
    { character_id: 'bob', text: 'I am well, thank you Alice.' },
    { character_id: 'alice', text: 'Shall we begin?' },
  ],
};

class MockProcessor {
  async process(_input) {
    return { ...FIXTURE_SCRIPT, characters: [...FIXTURE_SCRIPT.characters], lines: [...FIXTURE_SCRIPT.lines] };
  }
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

export { MockProcessor, fileToBase64, FIXTURE_SCRIPT };
