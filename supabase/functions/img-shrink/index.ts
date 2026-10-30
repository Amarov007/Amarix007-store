Deno.serve(() => new Response(JSON.stringify({ disabled: true }), { status: 410 }));
