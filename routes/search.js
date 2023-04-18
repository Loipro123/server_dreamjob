const pool = require('../db');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {check,validationResult, body} = require('express-validator');
const multer = require("multer");
const auth = require('../middleware/auth');
const { v4 } =require('uuid');

function getDayDiff(dateString) {
    const givenDate = new Date(dateString);
    const currentDate = new Date();
    const timeDiffInMs = currentDate.getTime() - givenDate.getTime();
    const dayDiff = Math.floor(timeDiffInMs / (24 * 60 * 60 * 1000));
    if(dayDiff === -1){
        return 0
    }
    return dayDiff;
  }

  function getLastTwoElements(str) {
    const arr = str.split(',');
    const lastTwoElements = arr.slice(-2);
    const result = lastTwoElements.join(',');
    return result.trim();
  }

  function getUnitValue(arr){
    const uniqueArr = Array.from(new Set(arr)); // ['car', 'dog']

    // filter out the elements that are not unique
    const resultArr = uniqueArr.filter((value, index, self) => {
      return self.indexOf(value) === index;
    });
    return resultArr;
  }

  function capitalizeWords(str) {
    return str.replace(/\b\w/g, function(l) {
      return l.toUpperCase();
    });
  }
  
router.get('/recommend',async(req,res)=> {
    const { jobid } = req.query;

    try {
        let posts= await pool.query(`SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.jobid,p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview,p.jobdescription, c.companyname,c.filename,t.title
          FROM post p 
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid
          where (p.jobid = ${jobid} and p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (p.jobid = ${jobid} and p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
        ) k
        LEFT JOIN applications a      
        ON k.postid = a.postid 
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid,k.jobdescription,k.jobid
         order by k.datecreated desc;`);
         let posts_order = {
            onsite: [],
            remote: [],
            hybrid: []
        }
         for(let i =0;i< posts.rows.length;i++){
            if(posts.rows[i].workplaceid ===1){
                posts_order.onsite.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }else if(posts.rows[i].workplaceid ===2){
                posts_order.remote.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }else{
                posts_order.hybrid.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }
        }
        res.json({
            posts: posts_order
        })
    } catch (error) {
        res.status(500).send('Server Errors')
    }
})



router.get('/',async(req,res)=> {
    let custom_address = [];
    let custom_titles = [];
    try {
        let titles= await pool.query(`
        select  t.title from post p inner join job_titles t
        On p.jobid = t.jobid
        where (p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
        ;
        `);
        let address= await pool.query(`
        select p.jobaddress from post p inner join job_titles t
        On p.jobid = t.jobid
        where (p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
        ;
        `);
        for(let i =0;i< address.rows.length;i++){
            custom_address.push(getLastTwoElements(address.rows[i].jobaddress))
            custom_titles.push(titles.rows[i].title)
        }
        res.json({
            title: getUnitValue(custom_titles),
            address: getUnitValue(custom_address)
        })
    } catch (error) {
        res.status(500).send('Server Errors')
    }
})

router.get('/find',async(req,res)=> {
    const { title,jobaddress } = req.query;
    let querySQL = '';
    if(title!=='null' && jobaddress!=='null'){
        querySQL = `SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.jobid,p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview,p.jobdescription, c.companyname,c.filename,t.title
          FROM post p 
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid
          where (LOWER(t.title) LIKE '%${title.toLocaleLowerCase()}%' and LOWER(p.jobaddress) LIKE '%${jobaddress.toLocaleLowerCase()}%' and p.delete=false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or
          (LOWER(t.title) LIKE '%${title.toLocaleLowerCase()}%' and LOWER(p.jobaddress) LIKE '%${jobaddress.toLocaleLowerCase()}%' and p.delete=false and p.applicationdeadline <NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
          ) k
        LEFT JOIN applications a      
        ON k.postid = a.postid 
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid,k.jobdescription,k.jobid
         order by k.datecreated desc;`
    }else if(title==='null' && jobaddress!=='null'){
        console.log(jobaddress)

        querySQL = `SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.jobid,p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview,p.jobdescription, c.companyname,c.filename,t.title
          FROM post p 
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid
          where (LOWER(p.jobaddress) LIKE '%${jobaddress.toLocaleLowerCase()}%' and p.delete=false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or
          (LOWER(p.jobaddress) LIKE '%${jobaddress.toLocaleLowerCase()}%' and p.delete=false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
        ) k
        LEFT JOIN applications a      
        ON k.postid = a.postid 
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid,k.jobdescription,k.jobid
         order by k.datecreated desc;`
    }else if(title!=='null' && jobaddress==='null'){
        querySQL = `SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.jobid,p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview,p.jobdescription, c.companyname,c.filename,t.title
          FROM post p 
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid
          where (LOWER(t.title) LIKE '%${title.toLocaleLowerCase()}%' and p.delete=false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or
          (LOWER(t.title) LIKE '%${title.toLocaleLowerCase()}%' and p.delete=false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
        ) k
        LEFT JOIN applications a      
        ON k.postid = a.postid 
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid,k.jobdescription,k.jobid
         order by k.datecreated desc;`
    }else{
        querySQL = `SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.jobid,p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview,p.jobdescription, c.companyname,c.filename,t.title
          FROM post p 
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid 
          where (p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
        ) k
        LEFT JOIN applications a      
        ON k.postid = a.postid 
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid,k.jobdescription,k.jobid
         order by k.datecreated desc;`
    }
    try {
        let posts= await pool.query(querySQL);
        console.log(querySQL)
         let posts_order = {
            onsite: [],
            remote: [],
            hybrid: []
        }
         for(let i =0;i< posts.rows.length;i++){
            if(posts.rows[i].workplaceid ===1){
                posts_order.onsite.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }else if(posts.rows[i].workplaceid ===2){
                posts_order.remote.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }else{
                posts_order.hybrid.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }
        }
        res.json({
            posts: posts_order,
            count: posts.rows.length
        })
    } catch (error) {
        res.status(500).send('Server Errors')
    }
})



module.exports = router;