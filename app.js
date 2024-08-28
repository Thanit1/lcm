const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const dbConnection = require('./database');
const app = express();
const port = 3000;
const moment = require('moment');

setInterval(updated_oNTime, 6000); 
setInterval(updated_oFFTime, 6000); 

app.use(express.urlencoded({ extended: false }));

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
app.get('/', (req, res) => {
    if (!req.session.userID) {
        res.render('login', { username: null });
    } else {
        dbConnection.query("SELECT email FROM users WHERE id=$1", [req.session.userID], (err, result) => {
            if (err) {
                return next(err);
            }
            res.render('index', {
                username: result.rows[0].name,
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
            return res.status(500).send('Internal Server Error');
        }
        const username = result.rows[0].email || 'Guest';
        // ส่งข้อมูลไปที่มุมมอง (view) เพื่อแสดงบนหน้าเว็บ
        res.render('index', { username });
    });
});
app.post('/addBoard', ifNotLoggedin, (req, res, next) => {
    const { switchname, tokenboard, user_email } = req.body;

    dbConnection.query("INSERT INTO boards (name, token, email) VALUES ($1, $2, $3)", [switchname, tokenboard, user_email], (err, result) => {
        if (err) {
            console.error('Error inserting board:', err);
            return next(err); // ส่งข้อผิดพลาดไปยัง middleware ถัดไป
        }

        res.redirect('/index'); // ลิ้งไปยังหน้าแอปหลักหลังจากเพิ่มข้อมูลเรียบร้อย
    });
});
app.post('/addSwitch', ifNotLoggedin, (req, res, next) => {
    const { nameSw, token, pinid } = req.body;
    const off = "off"
    dbConnection.query("INSERT INTO boardcontroller (name, token, pin,status,watt,timeoff) VALUES ($1,$2,$3,0,0,$4)", [nameSw, token, pinid, off], (err, result) => {
        if (err) {
            return next(err);
        }

        res.redirect('/index')
    });

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
        const token = req.params.token;
        const result = await dbConnection.query('SELECT * FROM boardcontroller WHERE token = $1 ORDER BY id ASC', [token]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
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

app.post('/addtime', ifNotLoggedin, (req, res,) => {
    const { date, minutes, time, token, pin } = req.body;
    const alltime = date + "|" + time + ":" + minutes;
    // ค้นหาโทเคนที่ตรงกับข้อมูลที่รับเข้ามา
    dbConnection.query("SELECT * FROM boardcontroller WHERE token = $1 AND pin = $2", [token, pin], (err, result) => {
        if (err) {
            return next(err);  // ส่งข้อผิดพลาดไปยัง middleware ถัดไป
        }

        if (result.rows.length > 0) {
            // อัพเดตสถานะของพินที่ตรงกัน
            dbConnection.query("UPDATE boardcontroller SET timeoff = $1 WHERE token = $2 AND pin = $3", [alltime, token, pin], (err, result) => {
                if (err) {
                    return next(err);
                }
                res.redirect('/index')
            });
        } else {
            return res.status(403).send('Incorrect token or pin');
        }
    });

});

app.post('/allgroup', ifNotLoggedin, (req, res,) => {
    const {  groupname, email } = req.body;
    dbConnection.query("INSERT INTO allGroup (groupName, email, timeon,timeoff,onEveryDay,offEveryDay) VALUES ($1,$2,null,null,null,null)", [groupname, email], (err, result) => {
        if (err) {
            return next(err);
        }

        res.redirect('/index')
    });

});
pp.post('/updatedgroup', ifNotLoggedin, (req, res,) => {
    const { timeon,timeoff,onEveryDay,offEveryDay, groupname, email } = req.body;
    // ค้นหาโทเคนที่ตรงกับข้อมูลที่รับเข้ามา
    dbConnection.query("SELECT * FROM allGroup WHERE email = $1 AND groupName = $2", [email, groupname], (err, result) => {
        if (err) {
            return next(err);  // ส่งข้อผิดพลาดไปยัง middleware ถัดไป
        }

        if (result.rows.length > 0) {
            // อัพเดตสถานะของพินที่ตรงกัน
            dbConnection.query("UPDATE allGroup SET timeon = $1 , timeoff = $2, onEveryDay = $3, offEveryDay = $4 WHERE email = $5 AND groupName = $6", [timeon,timeoff,onEveryDay,offEveryDay,email, groupname], (err, result) => {
                if (err) {
                    return next(err);
                }
                res.redirect('/index')
            });
        } else {
            return res.status(403).send('Incorrect token or pin');
        }
    });

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

app.post('/lambController', (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).send('Missing token.');
    }
    dbConnection.query('SELECT id, token, name, pin, status, watt, timeoff FROM boardcontroller WHERE token = $1', [token])
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

app.post('/swcontrol1', (req, res, next) => {
    const { token, status1, status2, status3 } = req.body;
    const pins = [1, 2, 3];
    const statuses = [status1, status2, status3];
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



function updated_oNTime() {

    const currentTime = moment().format('YYYY-MM-DD|HH:mm');

    dbConnection.query("SELECT id, token,pin , timeon FROM boardcontroller", (err, result) => {
        if (err) {
            console.error('Error querying the database:', err);
            return;
        }

        result.rows.forEach(row => {
            if (row.timeon === currentTime) {
                
                dbConnection.query("UPDATE boardcontroller SET status = 1 ,timeon = $1 WHERE id = $2", [null,row.id], (updateErr, updateResult) => {
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

    const currentTime = moment().format('YYYY-MM-DD|HH:mm');
    
    dbConnection.query("SELECT id, token,pin , timeoff FROM boardcontroller", (err, result) => {
        if (err) {
            console.error('Error querying the database:', err);
            return;
        }

        result.rows.forEach(row => {
            if (row.timeoff === currentTime) {
                
                dbConnection.query("UPDATE boardcontroller SET status = 0 ,timeoff = $1 WHERE id = $2", [null,row.id], (updateErr, updateResult) => {
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
    console.log(`Server is running on port ${port}`);
});
