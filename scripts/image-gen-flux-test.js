const handler = require('../api/image-gen');

async function run(body) {
  const req = { method: 'POST', body };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(n,v){this.headers[n]=v;},
    status(c){this.statusCode=c;return this;},
    json(p){console.log('STATUS', this.statusCode); console.log(JSON.stringify(p,null,2));},
    end(){console.log('END');}
  };
  await handler(req,res);
}

const imageUrl = 'https://static.vecteezy.com/system/resources/previews/025/222/157/non_2x/shawarma-sandwich-isolated-on-transparent-background-png.png';

(async() => {
  console.log('=== Object body test ===');
  await run({
    prompt: 'Flux test prompt for kontext',
    model: 'Flux-kontext',
    imageUrl
  });

  console.log('=== Array body test (single element) ===');
  await run([
    {
      prompt: 'Flux test prompt for kontext',
      model: 'Flux-kontext',
      imageUrl
    }
  ]);
})();

