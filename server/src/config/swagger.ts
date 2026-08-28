import swaggerJSDoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Women Safety & Menstrual Health REST API',
      version: '1.0.0',
      description: 'Production REST API backend with authentication, menstrual tracking, emergency contacts, SOS, AI assistant, and notifications.',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully.' },
            data: { type: 'object' },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'Invalid email address' },
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    path.resolve(__dirname, '../routes/*.ts').replace(/\\/g, '/'),
    path.resolve(__dirname, '../routes/*.js').replace(/\\/g, '/'),
    path.resolve(process.cwd(), 'src/routes/*.ts').replace(/\\/g, '/'),
    path.resolve(process.cwd(), 'dist/routes/*.js').replace(/\\/g, '/'),
  ],
};

export const swaggerSpec = swaggerJSDoc(options);