import express from 'express';
import crypto  from 'crypto';
import mongodb from 'mongodb';
import appSrc  from './app.js';

const { MongoClient } = mongodb;

const { MONGODB_URI, MONGODB_DB, BEARER_TOKEN, MY_LOGIN, MY_FULL_NAME, PORT } = process.env;

(async () => {
    try {
        const client = await MongoClient.connect( MONGODB_URI );
        console.log('Подключились к MongoDB! Переходим к запуску сервера.');
        
        const app = appSrc(express, crypto, client.db( MONGODB_DB ).collection('tasks'), BEARER_TOKEN, MY_LOGIN, MY_FULL_NAME);

        app.listen(PORT, '0.0.0.0', () => { console.log(`Сервер запущен на порту: ${PORT}.`); });
    } catch( error ) {
        console.error(`Ошибка при запуске сервера: ${error.message}.`);
    }
})();