import dotenv from 'dotenv';
import validator from 'validator';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { WebSocketServer } from 'ws';
import http from 'http';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

dotenv.config();

const prisma = new PrismaClient();

// WebSocket server setup
const server = http.createServer();
const wss = new WebSocketServer({ server });

const clients = [];
wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('close', () => {
        const index = clients.indexOf(ws);
        if (index !== -1) {
            clients.splice(index, 1);
        }
    });
});

// Rate limiter middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests, please try again later.',
});

export const createData = async (req, res) => {
    try {
        // Validate API Key
        if (!process.env.OPENAI_API_KEY) {
            console.error('Error: OpenAI API Key is missing.');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Validate input
        if (!req.body || !req.body.messages) {
            return res.status(400).json({ error: 'Messages are required' });
        }

        let messages = req.body.messages;

        // Validate if messages is an array
        if (!Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages must be an array of objects.' });
        }

        // Sanitize input
        messages = messages.map((message) => ({
            role: validator.escape(message.role),
            content: validator.escape(message.content),
        }));

        // Instruction message for AI
        const instructionMessage = {
            role: 'system',
            content: 'Hanya jawab pertanyaan tentang kalori makanan atau rekomendasi latihan fisik. Abaikan pertanyaan di luar topik ini.',
        };
        messages.unshift(instructionMessage);

        // Check if request is for planner
        const isPlannerRequest = messages.some((message) =>
            message.content.toLowerCase().includes('buatkan plan') ||
            message.content.toLowerCase().includes('planner makanan dan olahraga')
        );

        if (isPlannerRequest) {
            // Extract user inputs for planner using helper functions
            const weight = extractWeight(messages);
            const height = extractHeight(messages);
            const age = extractAge(messages);
        
            if (!weight || !height || !age) {
                return res.status(400).json({ error: 'Weight, height, and age are required for planner generation.' });
            }
        
            // Add instruction for formatting the response
            const plannerRequest = {
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant. Please generate a structured and clearly formatted fitness and meal plan. The plan should include:\n\n' +
                            '1. **Recommended Calories** (in kcal)\n'  +
                            '2. **Food Plan** with daily meals (breakfast, snacks, lunch, and dinner). Each meal should include food items and portion sizes.\n' +
                            '3. **Exercise Plan** with the days of the week and exercises for each day (strength training, cardio, etc.). Include sets and repetitions for strength exercises and duration for cardio.\n\n' +
                            'Use the following format for each section:\n' +
                            '### Recommended Calories\n' +
                            'Insert calory in kcal\n\n' +
                            '### Food Plan\n' +
                            '### Sarapan\n' +
                            '- List the items for breakfast here.\n' +
                            '### Makan Siang\n' +
                            '- List the items for lunch here.\n' +
                            '### Makan Malam\n' +
                            '- List the items for dinner here.\n' +
                            '### Snacks\n' +
                            '- List the snacks here.\n\n' +
                            '### Exercise Plan\n' +
                            '### Senin\n' +
                            '- List the exercises for Monday.\n' +
                            '### Selasa\n' +
                            '- List the exercises for Tuesday.\n' +
                            '### Rabu\n' +
                            '- List the exercises for Wednesday.\n\n' +
                            'The output must be clearly divided into these sections, and each section must be easily extractable using basic string parsing or regex.'
                    },
                    ...messages // existing user messages
                ],
                max_tokens: 500,
                temperature: 0.7,
            };

        
            try {
                const response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    plannerRequest,
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
        
                const output = response.data.choices[0].message.content;
        
                // Extract data from OpenAI response
                const recommendedCalories = extractCalories(output);
                const foodPlan = extractFoodPlan(output);
                const exercisePlan = extractExercisePlan(output);
        
                // Save to database
                const newPlanner = await prisma.planner.create({
                    data: {
                        user: { connect: { user_id: req.user.user_id } },
                        recommended_calories: recommendedCalories,
                        food_plan: foodPlan,
                        exercise_plan: exercisePlan,
                    },
                });
        
                // Return full output in the response
                res.status(201).json({
                    message: 'Planner generated successfully.',
                    output: output,
                    recommendedCalories: recommendedCalories,
                    foodPlan: foodPlan,
                    exercisePlan: exercisePlan,
                    plannerDetails: newPlanner,
                });
            } catch (error) {
                console.error('Error generating planner:', error);
                res.status(500).json({ error: 'Failed to generate planner. Please try again later.' });
            }
        }else {
            // Non-planner OpenAI API call
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o',
                    messages: messages,
                    max_tokens: 300,
                    temperature: 0.7,
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const output = response.data.choices[0].message.content;

            // Save to database
            const newData = await prisma.data.create({
                data: {
                    messages: JSON.stringify(messages),
                    output,
                    author: { connect: { user_id: req.user.user_id } },
                },
            });

            // Notify WebSocket clients
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ messages, output }));
                }
            });

            res.status(201).json(newData);
        }
    } catch (error) {
        console.error('Error processing request:', error.message);
        if (error.response) {
            console.error('OpenAI Response Error:', error.response.data);
        }
        res.status(500).json({ error: 'Failed to process input' });
    }
};

// Extract recommended calories from the formatted response
const extractCalories = (output) => {
    // Adjusted regex to match the format for calories
    const caloriesRegex = /### Recommended Calories\s*-\s*(\d+)\s*kcal/i;
    const match = output.match(caloriesRegex);
    
    if (match) {
        // Extract the numeric value and return as integer
        return parseInt(match[1], 10);
    }
    
    return 0; // Return 0 if no match found
};


// Extract the food plan (breakfast, lunch, dinner, and snacks) from the formatted response
const extractFoodPlan = (output) => {
    const foodPlanRegex = /### Food Plan([\s\S]*?)### Exercise Plan/i;
    const match = output.match(foodPlanRegex);
    if (match) {
        const foodPlanContent = match[1].trim();
        
        // You can further parse and clean up food plan sections if necessary
        return foodPlanContent;
    }
    return null;
};

// Extract the exercise plan (for each day of the week) from the formatted response
const extractExercisePlan = (output) => {
    const exercisePlanRegex = /### Exercise Plan([\s\S]*)/i;
    const match = output.match(exercisePlanRegex);
    if (match) {
        const exercisePlanContent = match[1].trim();
        
        // You can further parse and clean up exercise plan sections if necessary
        return exercisePlanContent;
    }
    return null;
};






// Helper functions to extract data using regex
const extractWeight = (messages) => {
    const weightRegex = /berat badan\s*(\d+)\s*kg/i;
    const match = messages.find((msg) => weightRegex.test(msg.content));
    return match ? parseFloat(weightRegex.exec(match.content)[1]) : null;
};

const extractHeight = (messages) => {
    const heightRegex = /tinggi badan\s*(\d+)\s*cm/i;
    const match = messages.find((msg) => heightRegex.test(msg.content));
    return match ? parseFloat(heightRegex.exec(match.content)[1]) : null;
};

const extractAge = (messages) => {
    const ageRegex = /usia\s*(\d+)\s*tahun/i;
    const match = messages.find((msg) => ageRegex.test(msg.content));
    return match ? parseInt(ageRegex.exec(match.content)[1]) : null;
};
