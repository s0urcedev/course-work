import { MongoClient, ObjectId } from 'mongodb';
import { settings } from '../settings.js';
import { calculateLevels, calculateLevelsIndexes } from '../tools/calculations.js';

export async function getTest(id) {
    const client = new MongoClient(settings.authDBURL);
    const collectionTests = client.db('testing').collection('tests');
    await client.connect();
    let res;
    try {
        res = await collectionTests.findOne({ _id: ObjectId(id) });
    } catch (err) {
        res = undefined;
    }
    await client.close();
    return res;
}

export async function getSession(id) {
    const client = new MongoClient(settings.authDBURL);
    const collectionSession = client.db('testing').collection('sessions');
    await client.connect();
    let res;
    try {
        res = await collectionSession.findOne({ _id: ObjectId(id) });
    } catch (err) {
        res = undefined;
    }
    await client.close();
    return res;
}

export async function getQuestion(sessionId) {
    const client = new MongoClient(settings.authDBURL);
    const collectionTests = client.db('testing').collection('tests');
    let session = await getSession(sessionId);
    await client.connect();
    let res;
    try {
        res = await collectionTests.findOne({ _id: ObjectId(session['testId']) });
    } catch (err) {
        await client.close();
        res = undefined;
        return undefined;
    }
    await client.close();
    return {
        'text': res['questions'][session['levelsOfQuestionsIndexes'][session['currentQuestionLevel']]]['text'],
        'answers': [res['questions'][session['levelsOfQuestionsIndexes'][session['currentQuestionLevel']]]['rightAnswer'], ...res['questions'][session['levelsOfQuestionsIndexes'][session['currentQuestionLevel']]]['wrongAnswers']]
    };
}

export async function getUsersTests(authorsEmail) {
    const client = new MongoClient(settings.authDBURL);
    const collectionTests = client.db('testing').collection('tests');
    await client.connect();
    let res;
    try {  
        res = await collectionTests.find({ authorsEmail: authorsEmail }).toArray();
    } catch (err) {
        res = undefined;
    }
    await client.close();
    return res;
}

export async function getResult(id) {
    const client = new MongoClient(settings.authDBURL);
    const collectionResults = client.db('testing').collection('results');
    await client.connect();
    let res;
    try {
        res = await collectionResults.findOne({ _id: ObjectId(id) });
    } catch (err) {
        res = undefined;
    }
    await client.close();
    return res;
}

export async function getTestsResults(id) {
    const client = new MongoClient(settings.authDBURL);
    const collectionResults = client.db('testing').collection('results');
    await client.connect();
    let res;
    try {  
        res = await collectionResults.find({ testId: id }).toArray();
    } catch (err) {
        res = undefined;
    }
    await client.close();
    return res;
}

export async function deleteResult(id) {
    const client = new MongoClient(settings.authDBURL);
    const collectionResults = client.db('testing').collection('results');
    await collectionResults.deleteOne({ _id: ObjectId(id) });
    await client.close();
}

export async function createTest(email, referer) {
    const client = new MongoClient(settings.authDBURL);
    const collectionTests = client.db('testing').collection('tests');
    await client.connect();
    let inseted = await collectionTests.insertOne({
        'authorsEmail': email,
        'name': (referer ?? '').includes('/uk') ? 'Порожній тест' : 'Blank test',
        'numberOfQuestionsForStudent': 1,
        'numberOfQuestionsForTeacher': 1,
        'numberOfMaxPoints': 1,
        'questions': [
            {
                'text': (referer ?? '').includes('/uk') ? 'Порожнє питання' : 'Blank question',
                'rightAnswer': (referer ?? '').includes('/uk') ? 'Порожня правильна відповідь' : 'Blank right answer',
                'wrongAnswers': [
                    (referer ?? '').includes('/uk') ? 'Порожня неправильна відповідь' : 'Blank wrong answer'
                ],
                'numberOfAnswers': 2
            }
        ]
    });
    await client.close();
    return inseted.insertedId;
}

export async function deleteTest(id) {
    const client = new MongoClient(settings.authDBURL);
    const collectionTests = client.db('testing').collection('tests');
    const collectionSessions = client.db('testing').collection('sessions');
    const collectionResults = client.db('testing').collection('results');
    await client.connect();
    await collectionTests.deleteOne({ _id: ObjectId(id) });
    await collectionSessions.deleteMany({ testId: id });
    await collectionResults.deleteMany({ testId: id });
    await client.close();
}

export async function editTest(id, object) {
    const client = new MongoClient(settings.authDBURL);
    const collectionTests = client.db('testing').collection('tests');
    await client.connect();
    let status = 500;
    try {
        await collectionTests.replaceOne({ _id: ObjectId(id) }, object);
        status = 200;
    } catch (err) {
        status = 500;
    }
    await client.close();
    return status;
}

export async function startSession(id, userName) {
    let test = await getTest(id);
    const client = new MongoClient(settings.authDBURL);
    const collectionSession = client.db('testing').collection('sessions');
    await client.connect();
    let inserted = undefined;
    try {
        inserted = await collectionSession.insertOne({
            testId: id,
            testName: test['name'],
            userName: userName,
            startDate: new Date(),
            currentQuestionLevel: test['numberOfQuestionsForStudent'],
            counter: 0,
            levelsOfQuestionsIndexes: calculateLevelsIndexes(calculateLevels(test['numberOfQuestionsForStudent'])),
            score: 0,
            maxScore: test['numberOfMaxPoints']
        });
    } catch (err) {
        await client.close();
        return undefined;
    }
    await client.close();
    return inserted.insertedId;
}

export async function checkAnswer(sessionId, answer) {
    let session = await getSession(sessionId);
    let test = await getTest(session['testId']);
    const client = new MongoClient(settings.authDBURL);
    const collectionSession = client.db('testing').collection('sessions');
    const collectionResults = client.db('testing').collection('results');
    if (answer === test['questions'][session['levelsOfQuestionsIndexes'][session['currentQuestionLevel']]]['rightAnswer']) {
        session['levelsOfQuestionsIndexes'][session['currentQuestionLevel']] ++;
        session['score'] += session['currentQuestionLevel'];
        session['currentQuestionLevel'] ++;
        session['counter'] ++;
    } else {
        session['levelsOfQuestionsIndexes'][session['currentQuestionLevel']] ++;
        session['currentQuestionLevel'] --;
        session['counter'] ++;
    }
    await client.connect();
    delete session.id;
    try {
        await collectionSession.replaceOne({ _id: ObjectId(sessionId) }, session);
    } catch (err) {
        await client.close();
        return undefined;
    }
    await client.close();
    if (session['counter'] >= test['numberOfQuestionsForStudent']) {
        await client.connect();
        let inserted = '';
        try {
            await collectionSession.deleteOne({ _id: ObjectId(sessionId) });
            inserted = await collectionResults.insertOne({
                testId: session['testId'],
                testName: session['testName'],
                userName: session['userName'],
                startDate: session['startDate'],
                endDate: new Date(),
                score: session['score'],
                maxScore: session['maxScore']
            });
        } catch (err) {
            await client.close();
            return undefined;
        }
        await client.close();
        return {
            'status': 'finished',
            'resultId': inserted.insertedId
        };
    } else {
        return {
            'status': 'ongoing'
        };
    }
}