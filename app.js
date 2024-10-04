const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const dbConnection = require('./db/citus');
const app = express();
const port = 8900;
const moment = require('moment-timezone');
const ExcelJS = require('exceljs'); // เพิ่มบรรทัดนี้
const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const { write } = require('pdfkit');

setInterval(updated_oNTime, 6000);
setInterval(updated_oFFTime, 6000);
setInterval(updated_TimeoN, 60000); // เรียกใช้ทุกนาที


app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

// SET OUR VIEWS AND VIEW ENGINE
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.json());

// APPLY COOKIE SESSION MIDDLEWARE
app.use(cookieSession({
    name: 'session',
    keys: ['key1', 'key2'],
    maxAge: 3600 * 1000 // 1hr
}));

const ifNotLoggedin = (req, res, next) => {
    if (!req.session.isLoggedIn) {
        return res.render('login');
    }
    next();
};
const ifLoggedin = (req, res, next) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/index');
    }
    next();
};
app.get('/', (req, res, next) => {
    if (!req.session.userID) {
        res.render('title', { username: null });
    } else {
        dbConnection.query("SELECT * FROM users WHERE id=$1", [req.session.userID], (err, result) => {
            if (err) {
                return next(err);
            }
            const successMessage = req.session.successMessage || null; // Get success message from session
            req.session.successMessage = null; // Clear the success message from the session

            res.render('title', {
                username: result.rows[0].email,
                name: result.rows[0].username,
                successMessage: successMessage // Pass the success message to the template
            });
        });
    }
});


app.get('/register', ifLoggedin, (req, res) => {
    res.render('register', {
        register_error: [],
        old_data: {},
    });
});
app.get('/login', ifLoggedin, (req, res) => {

    if (req.query.register === 'success') {
        const registerSuccess = req.query.register === 'success';
        res.render('login', {
            login_errors: [],
            register_success: registerSuccess,

        });
    } else {
        res.render('login', {
            login_errors: [],

        });
    }


});
app.post('/login', ifLoggedin, [
    body('user_email').custom((value) => {
        return dbConnection.query('SELECT email FROM users WHERE email=$1', [value])
            .then((result) => {
                if (result.rows.length === 1) {
                    return true;
                }
                return Promise.reject('Invalid Email Address!');
            });
    }),
    body('user_pass', 'Password is empty!').trim().not().isEmpty(),
], (req, res) => {
    const validation_result = validationResult(req);
    const { user_pass, user_email } = req.body;

    if (validation_result.isEmpty()) {
        dbConnection.query("SELECT * FROM users WHERE email=$1", [user_email])
            .then((result) => {
                bcrypt.compare(user_pass, result.rows[0].password).then((compare_result) => {
                    if (compare_result === true) {
                        req.session.isLoggedIn = true;
                        req.session.userID = result.rows[0].id;
                        res.redirect('/index');
                    } else {
                        res.render('login', {
                            login_errors: ['Invalid Password!'],
                        });
                    }
                })
                    .catch((err) => {
                        if (err) throw err;
                    });
            })
            .catch((err) => {
                if (err) throw err;
            });
    } else {
        let allErrors = validation_result.errors.map((error) => {
            return error.msg;
        });
        console.log(allErrors)
        res.render('login', {
            login_errors: allErrors,
        });
    }
});
app.post('/register', ifLoggedin, [
    body('user_email', 'Invalid email address!').isEmail().custom((value) => {
        return dbConnection.query('SELECT email FROM users WHERE email=$1', [value])
            .then((result) => {
                if (result.rows.length > 0) {
                    return Promise.reject('This E-mail already in use!');
                }
                return true;
            });
    }),
    body('user_name', 'Username is Empty!').trim().not().isEmpty(),
    body('user_pass', 'Passwords do not match').custom((value, { req }) => {
        if (value !== req.body.confirm_pass) {
            throw new Error('Passwords do not match');
        }
        return true;
    }),
    body('user_pass', 'The password must be of minimum length 6 characters').trim().isLength({ min: 6 }),
], (req, res, next) => {
    const validation_result = validationResult(req);
    const { user_name, user_pass, user_email } = req.body;
    if (validation_result.isEmpty()) {
        bcrypt.hash(user_pass, 12).then((hash_pass) => {
            dbConnection.query("INSERT INTO users(username, email, password) VALUES($1, $2, $3)", [user_name, user_email, hash_pass])
                .then(() => {

                    res.redirect('/login?register=success');

                })
                .catch((err) => {
                    if (err) throw err;
                });
        })
            .catch((err) => {
                if (err) throw err;
            });
    } else {
        let allErrors = validation_result.errors.map((error) => {
            return error.msg;
        });
        res.render('register', {
            register_error: allErrors,
            old_data: req.body,
        });
    }
});
app.get('/index', ifNotLoggedin, (req, res) => {
    dbConnection.query("SELECT * FROM users WHERE id=$1", [req.session.userID], (err, result) => {
        if (err) {
            return next(err);
        }
        const successMessage = req.session.successMessage || null; // Get success message from session
        req.session.successMessage = null; // Clear the success message from the session

        res.render('index', {
            username: result.rows[0].email,
            name: result.rows[0].username,
            successMessage: successMessage // Pass the success message to the template
        });
    });
});
app.post('/addBoard', ifNotLoggedin, (req, res, next) => {
    const { switchname, tokenboard, user_email } = req.body;

    dbConnection.query("INSERT INTO boards (name, token, email) VALUES ($1, $2, $3)", [switchname, tokenboard, user_email], (err, result) => {
        if (err) {
            console.error('Error inserting board:', err);
            return next(err); // ส่งข้อผิดพลาดไปยัง middleware ถัดไป
        }
        req.session.successMessage = 'เพิ่มบอร์ดเรียบร้อยแล้ว';
        res.redirect('/index'); // ลิ้งไปยังหน้าแอปหลักหลังจากเพิ่มข้อมูลเรียบร้อย
    });
});
app.post('/addSwitch', ifNotLoggedin, (req, res, next) => {
    const { nameSw, token, pinid, watt } = req.body;
    console.log(req.body);
    const off = "off";
    const defaultValue = 0;

    dbConnection.query(
        "INSERT INTO boardcontroller (name, token, pin, status, watt, monday, tuesday, wednesday, thursday, friday, saturday, sunday) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [nameSw, token, pinid, defaultValue, watt, off, off, off, off, off, off, off],
        (err, result) => {
            if (err) {
                return next(err);
            }
            req.session.successMessage = 'เพิ่มสวิตช์เรียบร้อยแล้ว';
            res.redirect('/index');
        }
    );
});


app.post('/DELETE_Sw', ifNotLoggedin, (req, res,) => {
    const { token, pin } = req.body;
    if (!token || !pin) {
        return res.status(400).json({ message: 'Token and PIN are required' });
    }



    dbConnection.query('DELETE FROM boardcontroller WHERE token = $1 AND pin = $2', [token, pin], (err, result) => {
        if (err) {
            console.error('Error executing query', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'No matching records found' });
        }


        res.redirect('/index')
    });
});
app.post('/DELETE_board', ifNotLoggedin, (req, res,) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ message: 'Token and PIN are required' });
    }

    dbConnection.query('DELETE FROM boardcontroller WHERE token = $1 ', [token], (err, result) => {
        if (err) {
            console.error('Error executing query', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'No matching records found' });
        }

        dbConnection.query('DELETE FROM boards WHERE token = $1 ', [token], (err, result) => {
            if (err) {
                console.error('Error executing query', err);
                return res.status(500).json({ message: 'Internal Server Error' });
            }


            res.redirect('/index')
        });

    });
});
app.get('/getSwitch/:username', ifNotLoggedin, async (req, res) => {
    try {
        const username = req.params.username;
        const result = await dbConnection.query('SELECT * FROM controller WHERE email = $1 ORDER BY controller_id ASC ', [username]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.get('/getbord/:username', ifNotLoggedin, async (req, res) => {
    try {
        const username = req.params.username;
        const result = await dbConnection.query('SELECT * FROM boards WHERE email = $1 ORDER BY id_board ASC', [username]);
        // console.log(result.rows)
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.get('/getSwitch1/:token', ifNotLoggedin, async (req, res) => {
    try {
        const currentDay = moment().format('DD-MM-YYYY'); // รูปแบบวันที่ปัจจุบัน
        const token = req.params.token;

        // Query ข้อมูลจาก boardcontroller
        const boardResult = await dbConnection.query('SELECT * FROM boardcontroller WHERE token = $1 ORDER BY id ASC', [token]);

        // Query เพื่อดึงและรวมค่า usage_minutes สำหรับแต่ละ pin ในวันที่ปัจจุบัน
        const usageResult = await dbConnection.query(
            'SELECT pin, SUM(usage_minutes) as total_usage FROM electricity_usage WHERE token = $1 AND "timestamp" LIKE $2 GROUP BY pin',
            [token, `${currentDay}%`] // กรองเฉพาะวันที่ปัจจุบัน
        );

        // สร้าง object ที่จะรวมผลลัพธ์สำหรับแต่ละ pin
        for (let row of usageResult.rows) {
            // หาค่าพลังงานที่ใช้สำหรับ pin นั้น ๆ
            const boardRow = boardResult.rows.find(br => br.pin === row.pin); // หาค่า watt จาก result
            if (boardRow) {
                const powerUsing = (boardRow.watt * (row.total_usage / 60)) / 1000;

                // อัปเดตค่า PowerUsing ในตาราง boardcontroller
                await dbConnection.query(
                    'UPDATE boardcontroller SET "PowerUsing" = $1 WHERE token = $2 AND pin = $3',
                    [powerUsing, token, row.pin]
                );
            }
        }

        // ดึงข้อมูล boardcontroller ที่อัปเดตแล้ว
        const boardResult1 = await dbConnection.query('SELECT * FROM boardcontroller WHERE token = $1 ORDER BY id ASC', [token]);

        // ส่งข้อมูล JSON รวมทั้งข้อมูลของ boardcontroller

        res.json(boardResult1.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/dayonoff', (req, res) => {
    const currentDay = moment().tz('Asia/Bangkok').format('dddd').toLowerCase(); // ดึงชื่อวันปัจจุบันตามเวลาไทย
    const currentDayoff = currentDay + "off"; // ดึงชื่อวันปัจจุบันสำหรับ off

    res.json({ currentDay: currentDay, currentDayoff: currentDayoff });
});

app.post('/controller1', ifNotLoggedin, (req, res, next) => {
    const { token, pinname } = req.body;
    let status = 0;
    dbConnection.query("SELECT * FROM boardcontroller WHERE token = $1 AND pin = $2", [token, pinname], (err, result) => {
        if (err) {
            return next(err);
        }

        if (result.rows.length > 0) {
            // พบโทเคนและพินที่ตรงกัน
            if (result.rows[0].status == 0) {
                status = 1;
            } else if (result.rows[0].status == 1) {
                status = 0;
            }

            // อัพเดตสถานะของพินที่ตรงกัน
            dbConnection.query("UPDATE boardcontroller SET status = $1 WHERE token = $2 AND pin = $3", [status, token, pinname], (err, result) => {
                if (err) {
                    return next(err);
                }


                res.redirect('index');
            });
        } else {
            return res.status(403).send('Incorrect token or pin');
        }
    });
});
app.post('/oncontroller', ifNotLoggedin, (req, res, next) => {
    const { token } = req.body;
    let status = 1;

    dbConnection.query("UPDATE boardcontroller SET status = $1 WHERE token = $2 ", [status, token], (err, result) => {
        if (err) {
            return next(err);
        }

        req.session.successMessage = 'เปิดไฟทั้งหมดแล้ว'; // Store success message in session
        res.redirect('/index'); // Redirect to the index page
    });

});
app.post('/offcontroller', ifNotLoggedin, (req, res, next) => {
    const { token } = req.body;
    let status = 0;

    dbConnection.query("UPDATE boardcontroller SET status = $1 WHERE token = $2 ", [status, token], (err, result) => {
        if (err) {
            return next(err);
        }

        req.session.successMessage = 'ปิดไฟทั้งหมดแล้ว'; // Store success message in session
        res.redirect('/index'); // Redirect to the index page
    });

});

app.post('/controller', ifNotLoggedin, (req, res, next) => {
    const { token } = req.body;
    let status = 0;

    dbConnection.query("SELECT * FROM controller WHERE token=$1", [token], (err, result) => {
        if (err) {
            return next(err);
        }
        if (result.rows.length > 0) {
            status = result.rows[0].status === 0 ? 1 : 0;
        } else {
            return res.status(404).send('Switch not found');
        }
        dbConnection.query("UPDATE controller SET status=$1 WHERE token=$2", [status, token], (err, result) => {
            if (err) {
                return next(err);
            }

            res.redirect('/index')
        });
    });
});

app.post('/addtime', ifNotLoggedin, (req, res, next) => {
    const { minutes, time, switchStatus } = req.body;
    let selectedDays = req.body['days[]'];
    let switches = req.body['switches[]'];

    console.log(req.body);

    // Check if switches are provided
    if (!switches || (Array.isArray(switches) && switches.length === 0)) {
        req.session.successMessage = 'กรุณาเลือกสวิตช์'; // Store success message in session
        return res.redirect('/index'); // Redirect to the index page
    }
    // Ensure selectedDays is an array
    if (!selectedDays || (!Array.isArray(selectedDays) && selectedDays.length === 0)) {
        req.session.successMessage = 'กรุณาเลือกวัน'; // Store success message in session
        return res.redirect('/index'); // Redirect to the index page

    }

    if (!Array.isArray(switches)) {
        switches = [switches];
    }

    // Ensure selectedDays is an array
    if (!Array.isArray(selectedDays)) {
        selectedDays = [selectedDays];
    }

    // Set the time format based on switchStatus
    const alltime = `${time}:${minutes}`;

    // Determine the appropriate columns to update based on switchStatus
    const columnPrefix = switchStatus === 'private' ? '' : 'off';

    // Check if any days are selected
    if (!selectedDays || selectedDays.length === 0) {
        return res.status(400).send('No days selected');
    }

    const queries = switches.map(switchData => {
        const [token, pin] = switchData.split('|');

        // Build the query dynamically based on selected days and column prefix
        const dayUpdates = selectedDays.map(day => `${day}${columnPrefix} = $1`).join(', ');
        const sqlQuery = `UPDATE boardcontroller SET ${dayUpdates} WHERE token = $2 AND pin = $3`;

        return dbConnection.query(
            sqlQuery,
            [alltime, token, pin]
        );
    });

    // Execute all the queries
    Promise.all(queries)
        .then(() => {
            req.session.successMessage = 'ตั้งเวลาสำเร็จแล้ว';
            res.redirect('index');
        })
        .catch(err => {
            console.error(err);
            res.status(500).send('Database error');
        });
});



app.get('/addtime/:username', (req, res) => {
    const username = req.params.username;
    console.log(username);
    // ดึงข้อมูลบอร์ดที่เชื่อมโยงกับ username
    dbConnection.query("SELECT token FROM boards WHERE email = $1", [username], (err, boardResult) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(boardResult.rows);
        // ดึง token จากผลลัพธ์บอร์ด
        const tokens = boardResult.rows.map(row => row.token);
        if (tokens.length === 0) {
            return res.status(404).send('No boards found for the username');
        }

        // สร้างคำสั่ง SQL สำหรับดึงข้อมูลสวิตช์ที่เชื่อมโยงกับหลาย token
        const placeholders = tokens.map((_, i) => `$${i + 1}`).join(', ');
        const query = `SELECT * FROM boardcontroller WHERE token IN (${placeholders})`;

        // ดึงข้อมูลสวิตช์ที่เชื่อมโยงกับ tokens
        dbConnection.query(query, tokens, (err, switchResult) => {
            if (err) {
                return console.error(err.message);
            }

            // ส่งข้อมูลสวิตช์เป็น JSON
            res.json(switchResult.rows);
        });
    });
});

app.post('/cancelTime', ifNotLoggedin, (req, res, next) => {
    const { switchStatus } = req.body;
    let selectedDays = req.body['days[]'];
    let switches = req.body['switchesCancel[]'];
    const time = "off"
    // Check if switches are provided
    if (!switches || (Array.isArray(switches) && switches.length === 0)) {
        req.session.successMessage = 'กรุณาเลือกสวิตช์'; // Store success message in session
        return res.redirect('/index'); // Redirect to the index page
    }
    // Ensure selectedDays is an array
    if (!selectedDays || (!Array.isArray(selectedDays) && selectedDays.length === 0)) {
        req.session.successMessage = 'กรุณาเลือกวัน'; // Store success message in session
        return res.redirect('/index'); // Redirect to the index page

    }
    if (!Array.isArray(switches)) {
        switches = [switches];
    }

    // Ensure selectedDays is an array
    if (!Array.isArray(selectedDays)) {
        selectedDays = [selectedDays];
    }



    // Determine the appropriate columns to update based on switchStatus
    const columnPrefix = switchStatus === 'private' ? '' : 'off';

    // Check if any days are selected
    if (!selectedDays || selectedDays.length === 0) {
        return res.status(400).send('No days selected');
    }

    const queries = switches.map(switchData => {
        const [token, pin] = switchData.split('|');

        // Build the query dynamically based on selected days and column prefix
        const dayUpdates = selectedDays.map(day => `${day}${columnPrefix} = $1`).join(', ');
        const sqlQuery = `UPDATE boardcontroller SET ${dayUpdates} WHERE token = $2 AND pin = $3`;

        return dbConnection.query(
            sqlQuery,
            [time, token, pin]
        );
    });

    // Execute all the queries
    Promise.all(queries)
        .then(() => {
            req.session.successMessage = 'ยกเลิกตั้งเวลาสำเร็จแล้ว';
            res.redirect('index');
        })
        .catch(err => {
            console.error(err);
            res.status(500).send('Database error');
        });
});

app.get('/cancelTime/:username', (req, res) => {
    const username = req.params.username;
    console.log(username);
    // ดึงข้อมูลบอร์ดที่เชื่อมโยงกับ username
    dbConnection.query("SELECT token FROM boards WHERE email = $1", [username], (err, boardResult) => {
        if (err) {
            return console.error(err.message);
        }

        // ดึง token จากผลลัพธ์บอร์ด
        const tokens = boardResult.rows.map(row => row.token);
        if (tokens.length === 0) {
            return res.status(404).send('No boards found for the username');
        }

        // สร้างคำสั่ง SQL สำหรับดึงข้อมูลสวิตช์ที่เชื่อมโยงกับหลาย token
        const placeholders = tokens.map((_, i) => `$${i + 1}`).join(', ');
        const query = `SELECT * FROM boardcontroller WHERE token IN (${placeholders})`;

        // ดึงข้อมูลสวิตช์ที่เชื่อมโยงกับ tokens
        dbConnection.query(query, tokens, (err, switchResult) => {
            if (err) {
                return console.error(err.message);
            }

            // ส่งข้อมูลสวิตช์เป็น JSON
            res.json(switchResult.rows);
        });
    });
});

app.post('/editSwitch', async (req, res, next) => {
    try {
        const { token, pin, watt, name } = req.body;

        // Update the switch in the boardcontroller table
        await dbConnection.query(
            'UPDATE boardcontroller SET name = $1 , watt =$2 WHERE token = $3 AND pin = $4',
            [name, watt, token, pin]
        );

        // Get user email for rendering
        dbConnection.query("SELECT email FROM users WHERE id=$1", [req.session.userID], (err, result) => {
            if (err) {
                return next(err);
            }
            req.session.successMessage = 'สวิตช์ถูกแก้ไขเรียบร้อยแล้ว'; // Store success message in session
            res.redirect('/index'); // Redirect to the index page
        });

    } catch (error) {
        console.error('Error editing switch:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขสวิตช์' });
    }
});
app.post('/editBoard', async (req, res, next) => {
    try {
        const { token, name } = req.body;

        // Update the switch in the boardcontroller table
        await dbConnection.query(
            'UPDATE boards SET name = $1  WHERE token = $2 ',
            [name, token]
        );

        // Get user email for rendering
        dbConnection.query("SELECT email FROM users WHERE id=$1", [req.session.userID], (err, result) => {
            if (err) {
                return next(err);
            }
            req.session.successMessage = 'บอร์ดถูกแก้ไขเรียบร้อยแล้ว'; // Store success message in session
            res.redirect('/index'); // Redirect to the index page
        });

    } catch (error) {
        console.error('Error editing switch:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขสวิตช์' });
    }
});

app.get('/report', ifNotLoggedin, (req, res) => {
    dbConnection.query("SELECT * FROM users WHERE id=$1", [req.session.userID], (err, userResult) => {
        if (err) {
            return res.status(500).send('Internal Server Error');
        }

        const username = userResult.rows[0].email || 'Guest';

        // Fetch tokens associated with the user
        dbConnection.query("SELECT token,name FROM boards WHERE email=$1", [username], (err, tokenResult) => {
            if (err) {
                return res.status(500).send('Error fetching tokens');
            }

            const tokens = tokenResult.rows; // Get tokens from query result

            // Render 'report' template with both username and tokens
            res.render('report', { username, tokens });
        });
    });
});
// ... existing code ...

app.get('/fetch-total-hours', (req, res) => {
    const userID = req.session.userID;

    dbConnection.query("SELECT * FROM users WHERE id=$1", [userID], (err, userResult) => {
        if (err) {
            return res.status(500).send('Internal Server Error');
        }

        const username = userResult.rows[0].email || 'Guest';

        // Fetch tokens associated with the user
        dbConnection.query("SELECT token, name FROM boards WHERE email=$1", [username], (err, tokenResult) => {
            if (err) {
                return res.status(500).send('Internal Server Error');
            }

            const tokens = tokenResult.rows.map(row => row.token);
            const tokenNameMap = new Map(tokenResult.rows.map(row => [row.token, row.name]));

            if (tokens.length === 0) {
                return res.json([]);
            }

            // Fetch usage minutes for each token and pin
            dbConnection.query("SELECT token, pin, usage_minutes FROM electricity_usage WHERE token = ANY($1::text[])", [tokens], (err, usageResult) => {
                if (err) {
                    return res.status(500).send('Internal Server Error');
                }

                const usageData = usageResult.rows.map(row => ({
                    ...row,
                    boardName: tokenNameMap.get(row.token)
                }));

                res.json(usageData);
            });
        });
    });
});

// ... existing code ...
app.get('/token-data', async (req, res) => {
    try {
        const userEmail = req.session.username; // Assuming email is stored in session
        if (!userEmail) {
            return res.status(400).send('Email not provided');
        }

        const query = 'SELECT token FROM boards WHERE email = $1';
        const result = await db.query(query, [userEmail]); // Pass email as parameter
        const tokens = result.rows;

        res.render('form', { tokens }); // Pass the tokens to the form template
    } catch (err) {
        console.error('Error fetching tokens:', err);
        res.status(500).send('Server Error');
    }
});

app.get('/fetch-data', async (req, res) => {
    const tokens = req.query.tokens ? req.query.tokens.split(',') : [];
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    if (tokens.length === 0) {
        return res.status(400).send('Tokens parameter is required');
    }

    console.log('Received tokens:', tokens);
    console.log('Received start date:', startDate);
    console.log('Received end date:', endDate);

    try {
        // ดึงข้อมูลการใช้ไฟฟ้า
        const usageQuery = `
            SELECT id, token, pin, "timestamp", usage_minutes 
            FROM public.electricity_usage 
            WHERE token = ANY($1) 
            AND TO_TIMESTAMP("timestamp", 'DD-MM-YYYY HH24:MI')::date BETWEEN $2 AND $3  
            ORDER BY "timestamp" ASC
        `;
        const usageResult = await dbConnection.query(usageQuery, [tokens, startDate, endDate]);

        // ดึงข้อมูล watt จาก boardcontroller
        const wattQuery = `
            SELECT token, pin, watt
            FROM boardcontroller
            WHERE token = ANY($1)
        `;
        const wattResult = await dbConnection.query(wattQuery, [tokens]);

        // ดึงชื่อบอร์ด
        const nameQuery = `
            SELECT token, name
            FROM boards
            WHERE token = ANY($1)
        `;
        const nameResult = await dbConnection.query(nameQuery, [tokens]);

        // สร้าง map ของ watt และชื่อบอร์ดตาม token และ pin
        const wattMap = new Map();
        const boardNameMap = new Map();

        wattResult.rows.forEach(row => {
            wattMap.set(`${row.token}-${row.pin}`, row.watt);
        });

        nameResult.rows.forEach(row => {
            boardNameMap.set(row.token, row.name);
        });

        // รวมข้อมูล usage, watt และชื่อบอร์ด
        const combinedData = usageResult.rows.map(row => ({
            ...row,
            watt: wattMap.get(`${row.token}-${row.pin}`) || 0,
            boardName: boardNameMap.get(row.token) || 'Unknown Board'
        }));

        console.log(combinedData);
        res.json(combinedData);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/export-data', async (req, res) => {
    try {
        let { tokens, startDate, endDate, fileType } = req.body;

        // ตรวจสอบว่ามีการส่งค่ามาครบหรือไม่
        if (!tokens || !startDate || !endDate || !fileType) {
            return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
        }

        // แปลง tokens เป็น array ถ้ามันไม่ใช่ array
        if (!Array.isArray(tokens)) {
            tokens = [tokens];
        }

        // ดึงข้อมูลจากฐานข้อมูลตาม tokens และช่วงวันที่
        const query = `
            SELECT id, token, pin, "timestamp", usage_minutes 
            FROM public.electricity_usage 
            WHERE token = ANY($1::text[]) 
            AND "timestamp" BETWEEN $2 AND $3
            ORDER BY "timestamp" ASC
        `;
        const result = await dbConnection.query(query, [tokens, startDate, endDate]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบข้อมูลสำหรับ token และช่วงวันที่ระบุ' });
        }

        let exportedFile;
        if (fileType === 'excel') {
            exportedFile = await createExcelFile(result.rows);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=exported_data.xlsx');
        } else if (fileType === 'pdf') {
            exportedFile = await createPDFFile(result.rows);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=exported_data.pdf');
        } else {
            return res.status(400).json({ error: 'ประเภทไฟล์ไม่ถูกต้อง' });
        }

        // ส่งไฟล์
        res.send(exportedFile);
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งออกข้อมูล: ' + error.message });
    }
});

app.post('/export-chart-data', (req, res) => {
    const { chartData, fileType } = req.body;

    if (!chartData || !fileType) {
        return res.status(400).send('ข้อมูลไม่ครบถ้วน');
    }

    // ตัวอย่างการสร้างไฟล์ (คุณอาจต้องใช้ library เช่น exceljs หรือ pdfkit)
    const filePath = path.join(__dirname, 'output', `chart_data.${fileType === 'excel' ? 'xlsx' : 'pdf'}`);

    // สร้างไฟล์ตัวอย่าง
    fs.writeFile(filePath, JSON.stringify(chartData), (err) => {
        if (err) {
            console.error('Error writing file:', err);
            return res.status(500).send('เกิดข้อผิดพลาดในการสร้างไฟล์');
        }

        res.download(filePath, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                return res.status(500).send('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์');
            }

            // ลบไฟล์หลังจากดาวน์โหลดเสร็จ
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting file:', err);
                }
            });
        });
    });
});

async function createExcelFile(data) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('รายงานการใช้ไฟฟ้า');

    // เพิ่มโลโก้
    const logoId = workbook.addImage({
        filename: path.join(__dirname, '/public/lcm-logo.png'),
        extension: 'png',
    });
    worksheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 150, height: 50 }
    });

    // หัวข้อรายงาน
    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'รายงานการใช้ไฟฟ้า';
    worksheet.getCell('A1').font = { size: 28, bold: true, color: { argb: 'FF1E3A8A' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

    // เพิ่มชื่อบอร์ด
    worksheet.mergeCells('A2:F2');
    const startDate = moment(data[0].startDate).format('DD/MM/YYYY');
    const endDate = moment(data[0].endDate).format('DD/MM/YYYY');
    worksheet.getCell('A2').value = startDate === endDate ? `วันที่: ${startDate}` : `วันที่: ${startDate} ถึง ${endDate}`;
    worksheet.getCell('A2').font = { size: 16, color: { argb: 'FF1E3A8A' } };
    worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

    // กำหนดหัวข้อคอลัมน์
    const headers = ['ลำดับ', 'หมายเลขช่อง', 'ชื่อบอร์ด', 'วันเวลา', 'ระยะเวลาใช้งาน (นาที)', 'หน่วยการใช้ไฟฟ้า (kWh)'];
    worksheet.addRow(headers);
    // จัดรูปแบบหัวข้อคอลัมน์
    worksheet.getRow(4).font = { bold: true, size: 14 };
    worksheet.getRow(4).alignment = { horizontal: 'center', vertical: 'middle' };

    // เพิ่มข้อมูล
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const boardNames = await getBoardNames(item.token);
        const watt = await getPinWatt(item.token, item.pin);
        const usageKWh = (item.usage_minutes / 60) * (watt / 1000);

        worksheet.addRow([
            i + 1,
            item.pin,
            boardNames,
            moment(item.timestamp, 'DD-MM-YYYY HH:mm').format('DD/MM/YYYY HH:mm:ss'),
            Number(item.usage_minutes.toFixed(2)),
            Number(usageKWh.toFixed(3))
        ]);
    }

    // จัดรูปแบบข้อมูล
    for (let i = 5; i <= worksheet.rowCount; i++) {
        worksheet.getRow(i).font = { size: 12 };
        worksheet.getRow(i).alignment = { horizontal: 'center', vertical: 'middle' };
        if (i % 2 === 0) {
            worksheet.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        }
    }

    // ปรับความกว้างคอลัมน์
    worksheet.columns.forEach((column, index) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            maxLength = Math.max(maxLength, cell.value ? cell.value.toString().length : 0);
        });
        column.width = maxLength < 12 ? 12 : maxLength;
    });

    return await workbook.xlsx.writeBuffer();
}

async function getBoardNames(token) {
    try {
        const result = await dbConnection.query('SELECT name FROM boards WHERE token=$1', [token]);
        if (result.rows.length > 0) {
            return result.rows.map(row => row.name).join(', ');
        } else {
            return 'ไม่พบชื่อบอร์ด';
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงชื่อบอร์ด:', error);
        return 'เกิดข้อผิดพลาด';
    }
}

async function getPinWatt(token, pin) {
    try {
        const result = await dbConnection.query('SELECT watt FROM boardcontroller WHERE token=$1 AND pin=$2', [token, pin]);
        if (result.rows.length > 0) {
            return result.rows[0].watt;
        } else {
            return 0;
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงค่า watt:', error);
        return 0;
    }
}

async function addBoardName(doc, token) {
    const boardNames = await getBoardNames(token);
    doc.font('Anuphan').fontSize(16).fillColor('#1e3a8a')
        .text(`ชื่อบอร์ด: ${boardNames}`, { align: 'center' });
}

async function createPDFFile(data) {
    return new Promise(async (resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            resolve(Buffer.concat(buffers));
        });

        // โหลดฟอนต์ภาษาไทย
        const fontPath = path.join(__dirname, '/public/Anuphan-Regular.ttf');
        doc.registerFont('Anuphan', fontPath);

        // สร้างพื้นหลังสีอ่อน
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f0f5f9');

        // เพิ่มโลโก้
        const logoPath = path.join(__dirname, '/public/lcm-logo.png');
        doc.image(logoPath, (doc.page.width - 50) / 2, 45, { width: 50 });

        // หัวข้อรายงาน
        doc.font('Anuphan').fontSize(28).fillColor('#1e3a8a')
            .text('รายงานการใช้ไฟฟ้า', (doc.page.width - 50) / 2.5, 100, { width: 250 });

        // เพิ่มชื่อบอร์ด
        await addBoardName(doc, data[0].token);
        doc.moveDown(2);

        // สร้างตาราง
        const table = {
            headers: ['ลำดับ', 'หมายเลขช่อง', 'ชื่อบอร์ด', 'วันเวลา', 'ระยะเวลาใช้งาน (นาที)', 'หน่วยการใช้ไฟฟ้า (kWh)'],
            rows: await Promise.all(data.map(async (item, index) => {
                const boardNames = await getBoardNames(item.token);
                const watt = await getPinWatt(item.token, item.pin);
                const usageKWh = (item.usage_minutes / 60) * (watt / 1000);
                return [
                    index + 1,
                    item.pin,
                    boardNames,
                    moment(item.timestamp, 'DD-MM-YYYY HH:mm').format('DD/MM/YYYY HH:mm:ss'),
                    item.usage_minutes.toFixed(2),
                    usageKWh.toFixed(3)
                ];
            }))
        };

        // ใช้ pdfkit-table เพื่อสร้างตาราง
        const PDFTable = require('pdfkit-table');
        doc.table(table, {
            prepareHeader: () => doc.font('Anuphan').fontSize(14).fillColor('black'),
            prepareRow: (row, i) => doc.font('Anuphan').fontSize(10).fillColor('#333333'),
            width: 550,
            x: 30,
            headerBackground: '#2563eb',
            alternateRowBackground: ['#ffffff', '#f3f4f6']
        });

        doc.moveDown(2);

        // เพิ่มสรุปข้อมูล
        const totalUsage = data.reduce((sum, item) => sum + item.usage_minutes, 0);
        const totalKWh = await data.reduce(async (sum, item) => {
            const watt = await getPinWatt(item.token, item.pin);
            return (await sum) + ((item.usage_minutes / 60) * (watt / 1000));
        }, Promise.resolve(0));

        doc.font('Anuphan').fontSize(14).fillColor('#1e3a8a')
            .text(`ระยะเวลาการใช้งานรวม: ${totalUsage.toFixed(2)} นาที`, doc.page.width / 2, null, { align: 'center' });
        doc.font('Anuphan').fontSize(14).fillColor('#1e3a8a')
            .text(`หน่วยการใช้ไฟฟ้ารวม: ${totalKWh.toFixed(3)} kWh`, doc.page.width / 2, null, { align: 'center' });

        doc.moveDown();
        doc.font('Anuphan').fontSize(12).fillColor('#64748b')
            .text(`วันที่ออกรายงาน: ${moment().format('DD/MM/YYYY HH:mm:ss')}`, doc.page.width / 2, null, { align: 'center' });

        // เพิ่มเลขหน้า
        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i++) {
            doc.switchToPage(i);
            doc.font('Anuphan').fontSize(10).fillColor('#64748b')
                .text(`หน้า ${i + 1} จาก ${pages.count}`,
                    doc.page.width / 2,
                    doc.page.height - 50,
                    { align: 'center' }
                );
        }

        doc.end();
    });
}


app.get('/title', (req, res) => {
    if (!req.session.userID) {
        res.render('title', { username: null });
    } else {
        dbConnection.query("SELECT * FROM users WHERE id=$1", [req.session.userID], (err, result) => {
            if (err) {
                return next(err);
            }
            const successMessage = req.session.successMessage || null; // Get success message from session
            req.session.successMessage = null; // Clear the success message from the session

            res.render('title', {
                username: result.rows[0].email,
                name: result.rows[0].username,
                successMessage: successMessage // Pass the success message to the template
            });
        });
    }
});
app.post('/swcontrol', (req, res) => {
    const { token, pin, status } = req.body;


    // ค้นหาโทเคนที่ตรงกับข้อมูลที่รับเข้ามา
    dbConnection.query("SELECT * FROM boardcontroller WHERE token = $1 AND pin = $2", [token, pin], (err, result) => {
        if (err) {
            return next(err);  // ส่งข้อผิดพลาดไปยัง middleware ถัดไป
        }

        if (result.rows.length > 0) {
            // อัพเดตสถานะของพินที่ตรงกัน
            dbConnection.query("UPDATE boardcontroller SET status = $1 WHERE token = $2 AND pin = $3", [status, token, pin], (err, result) => {
                if (err) {
                    return next(err);
                }
                res.status(200).json(result.rows);
            });
        } else {
            return res.status(403).send('Incorrect token or pin'); // ส่งข้อความผิดพลาดถ้าไม่พบโทเคนหรือพินที่ตรงกัน
        }
    });
});

// เพิ่มตัวแปรนี้ที่ด้านบนของไฟล์
const boardLastSeen = new Map();
const OFFLINE_THRESHOLD = 60 * 1000; // 1 นาทีในหน่วยมิลลิวินาที



app.post('/lambController', (req, res) => {
    const { token } = req.body;
    console.log(token)
    if (!token) {
        return res.status(400).send('Missing token.');
    }

    // อัพเดทเวลาล่าสุดที่บอร์ดส่งข้อมูลมา
    boardLastSeen.set(token, Date.now());

    // ดึงข้อมูลจาก boardcontroller
    dbConnection.query('SELECT id, token, name, pin, status, watt, upgdatetime FROM boardcontroller WHERE token = $1', [token])
        .then(result => {
            if (result.rows.length > 0) {
                res.status(200).json(result.rows);
            } else {
                res.status(404).send('Data not found.');
            }
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).send('Internal server error.');
        });
});

// เพิ่ม endpoint ใหม่สำหรับตรวจสอบสถานะบอร์ด
app.get('/boardStatus/:token', (req, res) => {
    const { token } = req.params;
    const lastSeen = boardLastSeen.get(token);
    const now = Date.now();
    const isOnline = lastSeen && (now - lastSeen) < OFFLINE_THRESHOLD;

    res.json({ isOnline, lastSeen: lastSeen || null });
});

app.get('/api/boards', (req, res) => {
    dbConnection.query('SELECT token FROM boardcontroller')
        .then(result => {
            res.json(result.rows);
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).json({ error: 'Internal server error' });
        });
});

app.post('/swcontrol1', (req, res, next) => {
    const { token, pin1, pin2, pin3 } = req.body;
    const pins = [1, 2, 3];
    const statuses = [pin1, pin2, pin3];
    console.log(req.body)
    dbConnection.query("SELECT * FROM boardcontroller WHERE token = $1", [token], (err, result) => {
        if (err) {
            return next(err);
        }

        if (result.rows.length > 0) {
            // วนลูปเพื่ออัพเดตสถานะของแต่ละพิน
            const updatePromises = pins.map((pin, index) => {
                return dbConnection.query("UPDATE boardcontroller SET status = $1 WHERE token = $2 AND pin = $3",
                    [statuses[index], token, pin]);
            });

            // รอให้ทุกคำสั่งอัพเดตเสร็จสิ้น
            Promise.all(updatePromises)
                .then(() => {
                    res.status(200).json({ message: 'Status updated successfully' });
                })
                .catch(err => {
                    next(err);
                });
        } else {
            return res.status(403).send('Incorrect token....');
        }
    });
});

app.post('/addTimeONled', (req, res, next) => {
    const { token, pin1, pin2, pin3 } = req.body;
    const pins = [1, 2, 3];
    const usage = [pin1, pin2, pin3];
    const currentTime = moment().tz('Asia/Bangkok').format('DD-MM-YYYY HH:mm');  // Set to Thailand time
    console.log(usage)

    console.log(req.body)
    // วนลูปเพื่ออัพเดตสถานะของแต่ละพิน
    const updatePromises = pins.map((pin, index) => {
        return dbConnection.query("INSERT INTO electricity_usage (token, pin, timestamp, usage_minutes )VALUES($1, $2, $3,$4)",
            [token, pin, currentTime, usage[index]]);
    });

    dbConnection.query("UPDATE boardcontroller SET upgdatetime = 0  WHERE token = $1", [token], (updateErr) => {
        if (updateErr) {
            console.error('Error updating status:', updateErr);
        } else {

        }
    });
    Promise.all(updatePromises)
        .then(() => {
            res.status(200).json({ message: 'Status updated successfully' });
        })
        .catch(err => {
            next(err);
        });

});

function updated_TimeoN() {
    const now = new Date(); // ดึงเวลาปัจจุบัน
    const options = { timeZone: 'Asia/Bangkok' };
    const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })); // แปลงเวลาตาม timezone Bangkok
    const minutes = bangkokTime.getMinutes(); // ดึงเลขนาที
    console.log(minutes); // จะแสดงเฉพาะเลขนาที
    // เช็คว่าเวลาตรงกับชั่วโมงเต็มหรือไม่
    if (minutes === 0) {
        dbConnection.query("UPDATE boardcontroller SET upgdatetime = 1", (updateErr) => {
            if (updateErr) {
                console.error('Error updating status:', updateErr);
            } else {

            }
        });
    }
}

function updated_oNTime() {

    const currentTime = moment().tz('Asia/Bangkok').format('HH:mm'); // Set to Thailand time
    const currentDay = moment().tz('Asia/Bangkok').format('dddd').toLowerCase(); // Set to Thailand time


    // Remove double quotes from around the query string
    dbConnection.query(`SELECT id, token, pin, ${currentDay} FROM boardcontroller`, (err, result) => {
        if (err) {
            console.error('Error querying the database:', err);
            return;
        }

        result.rows.forEach(row => {

            const dayTime = row[currentDay];
            const isDaySelected = dayTime !== null && dayTime !== undefined; // Check if there is a time set for the current day
            const isTimeMatch = dayTime === currentTime;

            /* console.log(`Checking row ${row.id}:`);
            console.log(`Current Time: ${currentTime}`);
            console.log(`Day Time (${currentDay}): ${dayTime}`);
            console.log(`Day Selected: ${isDaySelected}`);
            console.log(`Time Match: ${isTimeMatch}`); */

            // Update status only if the time matches and status is not already 1
            if (isDaySelected && isTimeMatch && row.status !== 1) {
                dbConnection.query("UPDATE boardcontroller SET status = 1 WHERE id = $1", [row.id], (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating status:', updateErr);
                    } else {
                        console.log(`Status updated to 1 for token: ${row.token} and pin: ${row.pin}`);
                    }
                });
            }
        });
    });
}


function updated_oFFTime() {

    const currentTime = moment().tz('Asia/Bangkok').format('HH:mm'); // Set to Thailand time
    const currentDay = moment().tz('Asia/Bangkok').format('dddd').toLowerCase() + "off"; // Set to Thailand time

    //console.log(currentDay)
    // Remove double quotes from around the query string
    dbConnection.query(`SELECT id, token, pin, ${currentDay} FROM boardcontroller`, (err, result) => {
        if (err) {
            console.error('Error querying the database:', err);
            return;
        }

        result.rows.forEach(row => {

            const dayTime = row[currentDay];
            const isDaySelected = dayTime !== null && dayTime !== undefined; // Check if there is a time set for the current day
            const isTimeMatch = dayTime === currentTime;

            /* console.log(`Checking row ${row.id}:`);
            console.log(`Current Time: ${currentTime}`);
            console.log(`Day Time (${currentDay}): ${dayTime}`);
            console.log(`Day Selected: ${isDaySelected}`);
            console.log(`Time Match: ${isTimeMatch}`); */

            // Update status only if the time matches and status is not already 1
            if (isDaySelected && isTimeMatch && row.status !== 0) {
                dbConnection.query("UPDATE boardcontroller SET status = 0 WHERE id = $1", [row.id], (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating status:', updateErr);
                    } else {
                        console.log(`Status updated to 1 for token: ${row.token} and pin: ${row.pin}`);
                    }
                });
            }
        });
    });
}
app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
