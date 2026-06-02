import mongoose from 'mongoose';
import logger from '../utils/logger';

export const connectDB = async (): Promise<void> => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/intellimeet';

  try {
    mongoose.connection.on('connecting', () => {
      logger.info('Connecting to MongoDB database...');
    });

    mongoose.connection.on('connected', () => {
      logger.info('Successfully connected to MongoDB.');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection disconnected.');
    });

    await mongoose.connect(mongoURI, {
      autoIndex: true, // Auto-build indexes defined in schemas
    });
  } catch (error: any) {
    logger.error(`Failed to initialize MongoDB connection: ${error.message}`);
    process.exit(1); // Crucial: terminate the process if DB initialization fails
  }
};

export default connectDB;
