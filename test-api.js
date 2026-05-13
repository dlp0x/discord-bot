async function test() {
    const response = await fetch(
      'http://10.0.0.219:3001/api/requests',
      {
        headers: {
          'x-api-key': 'super-secret-key'
        }
      }
    );
  
    const data = await response.json();
  
    console.log(data);
  }
  
  test();