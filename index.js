import express              from 'express';
import bodyParser           from 'body-parser';
import { createReadStream } from 'fs';
import crypto               from 'crypto';
import http                 from 'http';

import mongodb              from 'mongodb';
const { MongoClient } = mongodb;

import appSrc               from './app.js';

const app = appSrc(express, bodyParser, createReadStream, crypto, http, MongoClient);
app.listen(process.env.PORT);
