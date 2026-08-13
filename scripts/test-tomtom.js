(async ()=>{
  try {
    const key = '8owjyzAB71yyzLXzEJ59kp8vSWJayA6z';
    const res = await fetch(`https://api.tomtom.com/routing/matrix/2?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origins: [{ point: { latitude: 23.7808875, longitude: 90.2792371 } }],
        destinations: [{ point: { latitude: 23.8103, longitude: 90.4125 } }],
        options: { departAt: new Date().toISOString(), routeType: 'fastest', traffic: 'live' },
      }),
    });

    console.log('STATUS', res.status);
    const text = await res.text();
    console.log(text.slice(0, 2000));
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
