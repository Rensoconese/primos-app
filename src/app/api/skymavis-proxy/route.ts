import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;
    
    if (!query) {
      return NextResponse.json({ 
        error: 'GraphQL query is required' 
      }, { status: 400 });
    }
    
    console.log(`SkyMavis Proxy - Ejecutando consulta: ${query.substring(0, 100)}...`);
    
    // URL de la API GraphQL de SkyMavis
    const apiUrl = 'https://marketplace-graphql.skymavis.com/graphql';
    
    // Realizar la solicitud a la API de SkyMavis
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://marketplace.roninchain.com',
        'Referer': 'https://marketplace.roninchain.com/'
      },
      body: JSON.stringify({ query })
    });
    
    // Si la respuesta no es exitosa, lanzar un error
    if (!response.ok) {
      return NextResponse.json({ 
        error: `GraphQL API error: ${response.status} ${response.statusText}` 
      }, { status: response.status });
    }
    
    // Obtener los datos de la respuesta
    const data = await response.json();
    
    // Si hay errores en la respuesta GraphQL, devolverlos
    if (data.errors) {
      return NextResponse.json({ 
        error: `GraphQL query error: ${data.errors[0].message}`,
        graphqlErrors: data.errors
      }, { status: 400 });
    }
    
    // Registrar los datos recibidos para depuración
    console.log(`SkyMavis Proxy - Respuesta recibida: ${JSON.stringify(data).substring(0, 200)}...`);
    
    // Devolver los datos de la respuesta
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error en el proxy de SkyMavis:', error);
    return NextResponse.json({ 
      error: error.message || 'Error en el proxy de SkyMavis' 
    }, { status: 500 });
  }
}