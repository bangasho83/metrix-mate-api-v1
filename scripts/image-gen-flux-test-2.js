const handler = require('../api/image-gen');

async function run(body, label) {
  const req = { method: 'POST', body };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(n,v){this.headers[n]=v;},
    status(c){this.statusCode=c;return this;},
    json(p){console.log(label, 'STATUS', this.statusCode); console.log(JSON.stringify(p,null,2));},
    end(){console.log(label, 'END');}
  };
  await handler(req,res);
}

(async() => {
  const kontextSampleUrl = 'https://storage.googleapis.com/falserverless/example_inputs/kontext_example_input.webp';

  await run({ prompt: 'day time, more people walking, keep style', model: 'Flux-kontext', image_url: kontextSampleUrl }, 'official img_url');

  await run({ prompt: 'day time, more people walking, keep style', model: 'Flux-kontext', imageUrl: kontextSampleUrl }, 'official imageUrl');
})();

